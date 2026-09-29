// Retrait des proches par l'équipe d'assistance (ADR-0019). Données FICTIVES uniquement.
import type { AuditEvent, Patient, RelatedPerson } from 'fhir/r4.js';
import type { Utilisateur } from '@mbolo/identite';
import { describe, expect, it } from 'vitest';
import { ServiceAssistance } from './assistance.js';
import { COHORTE_PROCHES, DepotMemoire, type Invitation } from './depot.js';
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

function monter(o: { patients?: Patient[] } = {}) {
  const maintenant = new Date('2026-10-01T08:00:00Z');
  const depot = new DepotMemoire();
  const invitation = (id: string, rp: string, x: Partial<Invitation> = {}): Invitation => ({
    id,
    empreinte: Buffer.from(id),
    cohorte: COHORTE_PROCHES,
    type: 'proche',
    relatedPersonId: rp,
    creePar: 'u-p1',
    creeLe: new Date('2026-09-30T08:00:00Z'),
    expireLe: new Date('2026-10-07T08:00:00Z'),
    ...x,
  });
  // Un proche inscrit, une invitation en cours, une déjà retirée par le patient.
  depot.invitations.push(
    invitation('i-1', 'rp-1', { utiliseLe: new Date('2026-09-30T09:00:00Z'), utilisePar: 'u-r1' }),
    invitation('i-2', 'rp-2'),
    invitation('i-3', 'rp-3', { revoqueLe: new Date('2026-09-30T10:00:00Z') }),
  );
  const fiches = new Map<string, RelatedPerson>(
    (
      [
        ['rp-1', true],
        ['rp-2', false],
        ['rp-3', false],
      ] as const
    ).map(([id, active]) => [
      id,
      {
        resourceType: 'RelatedPerson',
        id,
        active,
        patient: { reference: 'Patient/pat-fictif-001' },
      },
    ]),
  );
  const traces: AuditEvent[] = [];
  const retraits: string[] = [];
  const alertes: string[] = [];
  const patients = o.patients ?? [patient];
  const service = new ServiceAssistance(
    depot,
    {
      rechercherPatients: async (systeme, valeur) =>
        patients.filter((p) =>
          p.identifier?.some((i) => i.system === systeme && i.value === valeur),
        ),
      patient: async (id) => patients.find((p) => p.id === id),
      prochesDuPatient: async (id) =>
        [...fiches.values()].filter((f) => f.patient.reference === `Patient/${id}`),
      tracer: async (t) => {
        traces.push(t);
      },
    },
    {
      desactiver: async (id) => {
        const f = fiches.get(id);
        if (f) fiches.set(id, { ...f, active: false });
      },
    },
    {
      retirerTous: async (c) => {
        retraits.push(`${c.jetonEquipe}:${c.patientId}`);
        return 2;
      },
    },
    {
      alerterPatient: async (id, alerte) => {
        alertes.push(`${id}:${alerte}`);
        return 'envoyee';
      },
    },
    new LimiteurMemoire(3, 15 * 60_000),
    { systemes: { 'assurance-maladie': SYSTEME, provisoire: `${SYSTEME}-provisoire` }, env: 'dev' },
    () => maintenant,
  );
  return { service, depot, fiches, traces, retraits, alertes };
}

const echec = (p: Promise<unknown>): Promise<ErreurProche> =>
  p.then(
    () => {
      throw new Error('refus attendu');
    },
    (x: unknown) => x as ErreurProche,
  );
const etape = (t: AuditEvent | undefined) => t?.entity?.[0]?.detail?.[0]?.valueString;

describe('ServiceAssistance', () => {
  it('retrouve le dossier par son numéro : numéro de rappel et nombre de proches, tracé', async () => {
    const m = monter();
    const fiche = await m.service.rechercher(assistant, {
      type: 'assurance-maladie',
      numero: 'FICTIF-0001',
    });
    // Ni date de naissance, ni prénom des proches : seulement de quoi rappeler le patient.
    expect(fiche).toEqual({
      patientId: 'pat-fictif-001',
      telephone: '+241 00 00 00 01',
      proches: 2,
    });
    expect(m.traces).toHaveLength(1);
    expect(m.traces[0]?.outcomeDesc).toBe('assistance-patient');
    expect(etape(m.traces[0])).toBe('recherche');
  });

  it('numéro inconnu ou partagé par deux dossiers : rien n’est montré', async () => {
    const m = monter({ patients: [patient, { ...patient, id: 'pat-fictif-009' }] });
    const e = await echec(
      m.service.rechercher(assistant, { type: 'assurance-maladie', numero: 'FICTIF-0001' }),
    );
    expect(e.statut).toBe(404);
    const inconnu = await echec(
      monter().service.rechercher(assistant, { type: 'provisoire', numero: 'FICTIF-0001' }),
    );
    expect(inconnu.statut).toBe(404);
    expect(m.traces).toHaveLength(0);
  });

  it('refuse un autre rôle, un agent IA, et le membre de l’équipe pour son propre dossier', async () => {
    const m = monter();
    for (const u of [
      { sujet: 'u-p1', roles: ['patient'], patientId: 'pat-fictif-001' },
      { sujet: 'u-ia', roles: ['assistance-patient', 'agent-ia'] },
      { sujet: 'u-a2', roles: ['assistance-patient', 'patient'], patientId: 'pat-fictif-001' },
    ] as Utilisateur[]) {
      const e = await echec(
        m.service.retirerProches(u, 'jeton', {
          patientId: 'pat-fictif-001',
          naissance: '1990-01-01',
        }),
      );
      expect(e.statut).toBe(403);
    }
    expect(m.retraits).toHaveLength(0);
  });

  it('date de naissance différente : rien n’est retiré, l’essai est tracé ; 3 essais au plus', async () => {
    const m = monter();
    const essai = () =>
      echec(
        m.service.retirerProches(assistant, 'jeton', {
          patientId: 'pat-fictif-001',
          naissance: '1991-01-01',
        }),
      );
    for (let i = 0; i < 3; i++) expect((await essai()).motif).toBe('naissance-differente');
    expect((await essai()).statut).toBe(429);
    expect(m.retraits).toHaveLength(0);
    expect(m.traces.map((t) => [t.outcome, etape(t)])).toEqual(
      Array(3).fill(['4', 'naissance-differente']),
    );
    expect(m.fiches.get('rp-1')?.active).toBe(true);
  });

  it('retire tous les proches : partages, fiche active, invitations ; le patient est prévenu', async () => {
    const m = monter();
    const r = await m.service.retirerProches(assistant, 'jeton-equipe', {
      patientId: 'pat-fictif-001',
      naissance: '1990-01-01',
    });
    expect(r).toEqual({ retires: 2, sms: 'envoyee' });
    expect(m.retraits).toEqual(['jeton-equipe:pat-fictif-001']);
    expect(m.fiches.get('rp-1')?.active).toBe(false);
    expect(m.depot.invitations.every((i) => i.revoqueLe)).toBe(true);
    expect(m.alertes).toEqual(['pat-fictif-001:proches-retires']);
    expect(etape(m.traces[0])).toBe('retrait-proches');
    // Plus rien à retirer ensuite.
    expect(
      (await m.service.rechercher(assistant, { type: 'assurance-maladie', numero: 'FICTIF-0001' }))
        .proches,
    ).toBe(0);
  });

  it('sans numéro dans le dossier : pas de rappel possible, donc pas de retrait', async () => {
    const m = monter({ patients: [{ ...patient, telecom: [] }] });
    const e = await echec(
      m.service.retirerProches(assistant, 'jeton', {
        patientId: 'pat-fictif-001',
        naissance: '1990-01-01',
      }),
    );
    expect(e.motif).toBe('sans-numero');
    expect(m.retraits).toHaveLength(0);
  });
});
