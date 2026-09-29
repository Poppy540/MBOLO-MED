// Récupération du compte d'un patient sans e-mail (ADR-0021). Données FICTIVES uniquement.
import type { AuditEvent, Patient } from 'fhir/r4.js';
import type { Utilisateur } from '@mbolo/identite';
import { describe, expect, it } from 'vitest';
import { ServiceAssistance } from './assistance.js';
import { creerEmpreinte, normaliser } from './codes.js';
import { DepotMemoire } from './depot.js';
import { LimiteurMemoire } from './limiteur.js';
import { ErreurProche } from './proches.js';

const SYSTEME = 'https://mbolo-sante.example/fhir/identifiant/fictif/assurance-maladie';
const assistant: Utilisateur = { sujet: 'u-assist', roles: ['assistance-patient'] };
const patient: Patient = {
  resourceType: 'Patient',
  id: 'pat-fictif-001',
  identifier: [{ system: SYSTEME, value: 'FICTIF-0001' }],
  telecom: [{ system: 'phone', value: '+241 00 00 00 01' }],
  birthDate: '1990-01-01',
};
const demande = {
  patientId: 'pat-fictif-001',
  naissance: '1990-01-01',
  type: 'assurance-maladie' as const,
  numero: 'FICTIF-0001',
};

function monter(o: { actif?: () => boolean; sansRecuperation?: boolean } = {}) {
  let maintenant = new Date('2026-10-01T08:00:00Z');
  const depot = new DepotMemoire();
  const empreinte = creerEmpreinte('essai-'.repeat(8));
  const traces: AuditEvent[] = [];
  const alertes: string[] = [];
  const service = new ServiceAssistance(
    depot,
    {
      rechercherPatients: async () => [patient],
      patient: async (id) => (id === patient.id ? patient : undefined),
      prochesDuPatient: async () => [],
      tracer: async (t) => {
        traces.push(t);
      },
    },
    { desactiver: async () => undefined },
    { retirerTous: async () => 0 },
    {
      alerterPatient: async (id, alerte) => {
        alertes.push(`${id}:${alerte}`);
        return 'envoyee';
      },
    },
    new LimiteurMemoire(3, 15 * 60_000),
    {
      systemes: { 'assurance-maladie': SYSTEME, provisoire: `${SYSTEME}-provisoire` },
      env: 'dev',
      ...(o.sansRecuperation
        ? {}
        : {
            recuperation: {
              empreinte,
              validiteHeures: 24,
              drapeaux: { estActif: async () => o.actif?.() ?? true },
            },
          }),
    },
    () => maintenant,
  );
  const avancer = (heures: number) => {
    maintenant = new Date(maintenant.getTime() + heures * 3_600_000);
  };
  return { service, depot, empreinte, traces, alertes, avancer };
}

const echec = (p: Promise<unknown>): Promise<ErreurProche> =>
  p.then(
    () => {
      throw new Error('refus attendu');
    },
    (x: unknown) => x as ErreurProche,
  );
const etape = (t: AuditEvent | undefined) => t?.entity?.[0]?.detail?.[0]?.valueString;
const utiliser = (m: ReturnType<typeof monter>, code: string, patientId = 'pat-fictif-001') =>
  m.service.utiliserCodeRecuperation({ code, sujet: 'u-p1', patientId });

describe('Récupération du compte (ADR-0021)', () => {
  it('remet un code valable 24 h, gardé seulement en empreinte, rattaché au dossier, tracé', async () => {
    const m = monter();
    const r = await m.service.creerCodeRecuperation(assistant, demande);
    expect(r.code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(r.expireLe).toBe('2026-10-02T08:00:00.000Z');
    const [i] = m.depot.invitations;
    expect(i).toMatchObject({
      type: 'recuperation',
      patientId: 'pat-fictif-001',
      creePar: 'u-assist',
    });
    expect(i?.empreinte.equals(m.empreinte(normaliser(r.code) ?? ''))).toBe(true);
    expect(JSON.stringify(m.depot.invitations)).not.toContain(r.code.replace('-', ''));
    expect(etape(m.traces.at(-1))).toBe('code-recuperation');
    // Aucun SMS à la création : le patient est au téléphone avec l'équipe.
    expect(m.alertes).toEqual([]);
  });

  it('le code sert une fois, pour ce dossier seulement ; le patient est prévenu par SMS', async () => {
    const m = monter();
    const { code } = await m.service.creerCodeRecuperation(assistant, demande);
    // Un autre dossier ne consomme pas le code.
    expect(await utiliser(m, code, 'pat-fictif-009')).toEqual({ utilise: false });
    expect(await utiliser(m, code.toLowerCase())).toEqual({ utilise: true, sms: 'envoyee' });
    expect(await utiliser(m, code)).toEqual({ utilise: false });
    expect(m.alertes).toEqual(['pat-fictif-001:compte-recupere']);
  });

  it('un nouveau code remplace l’ancien ; un code expiré ne sert plus', async () => {
    const m = monter();
    const premier = await m.service.creerCodeRecuperation(assistant, demande);
    const second = await m.service.creerCodeRecuperation(assistant, demande);
    expect(await utiliser(m, premier.code)).toEqual({ utilise: false });
    m.avancer(25);
    expect(await utiliser(m, second.code)).toEqual({ utilise: false });
    expect(m.alertes).toEqual([]);
  });

  it('refuse une date de naissance ou un numéro différents (tracés), 3 essais au plus', async () => {
    const m = monter();
    expect(
      (
        await echec(
          m.service.creerCodeRecuperation(assistant, { ...demande, numero: 'FICTIF-0002' }),
        )
      ).motif,
    ).toBe('numero-different');
    expect(
      (
        await echec(
          m.service.creerCodeRecuperation(assistant, { ...demande, naissance: '1991-01-01' }),
        )
      ).motif,
    ).toBe('naissance-differente');
    await m.service.creerCodeRecuperation(assistant, demande);
    expect((await echec(m.service.creerCodeRecuperation(assistant, demande))).statut).toBe(429);
    expect(m.traces.map((t) => [t.outcome, etape(t)])).toEqual([
      ['4', 'numero-different'],
      ['4', 'naissance-differente'],
      ['0', 'code-recuperation'],
    ]);
  });

  it('refuse un autre rôle, un agent IA et le membre de l’équipe pour son propre dossier', async () => {
    const m = monter();
    for (const u of [
      { sujet: 'u-p1', roles: ['patient'], patientId: 'pat-fictif-001' },
      { sujet: 'u-ia', roles: ['assistance-patient', 'agent-ia'] },
      { sujet: 'u-a2', roles: ['assistance-patient', 'patient'], patientId: 'pat-fictif-001' },
    ] as Utilisateur[]) {
      expect((await echec(m.service.creerCodeRecuperation(u, demande))).statut).toBe(403);
    }
    expect(m.depot.invitations).toHaveLength(0);
  });

  it('flag désactivé ou fonction absente : ni code remis, ni code utilisé', async () => {
    const off = monter({ actif: () => false });
    expect((await echec(off.service.creerCodeRecuperation(assistant, demande))).motif).toBe(
      'desactive',
    );
    const absente = monter({ sansRecuperation: true });
    expect((await echec(absente.service.creerCodeRecuperation(assistant, demande))).motif).toBe(
      'desactive',
    );
    expect(await utiliser(absente, 'ABCD-EFGH')).toEqual({ utilise: false });
  });

  it('flag désactivé après la remise : le code ne sert plus', async () => {
    let actif = true;
    const m = monter({ actif: () => actif });
    const { code } = await m.service.creerCodeRecuperation(assistant, demande);
    // Le flag est relu à l'utilisation, pour le membre de l'équipe qui a remis le code.
    actif = false;
    expect(await utiliser(m, code)).toEqual({ utilise: false });
    actif = true;
    expect(await utiliser(m, code)).toEqual({ utilise: true, sms: 'envoyee' });
  });
});
