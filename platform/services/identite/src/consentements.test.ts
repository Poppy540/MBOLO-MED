import { describe, expect, it } from 'vitest';
import {
  DepotMemoire,
  ErreurAcces,
  ErreurFonctionInactive,
  ErreurValidation,
  ServiceConsentements,
} from './consentements.js';
import { consentementActif } from './acces.js';
import { ErreurNiveauInsuffisant } from './niveau.js';
import type { Utilisateur } from './roles.js';

// Données FICTIVES.
const P1 = 'fictif-patient-0001';
// Niveau 2 (code SMS récent, ADR-0022) : exigé pour ouvrir le dossier à un tiers.
const patient1: Utilisateur = { sujet: 'u-p1', roles: ['patient'], patientId: P1, niveau: 2 };
const patient2: Utilisateur = {
  sujet: 'u-p2',
  roles: ['patient'],
  patientId: 'fictif-patient-0002',
};

const service = () =>
  new ServiceConsentements(
    new DepotMemoire(),
    'dev',
    { estActif: async () => true },
    () => new Date('2026-09-27T08:00:00Z'),
  );

const soins = {
  categorie: 'C-SOINS',
  mode: 'vocal',
  versionTexte: 'C-SOINS v0.1 (fr)',
  accepte: true,
} as const;

describe('ServiceConsentements', () => {
  it('enregistre un consentement conforme, horodaté, marqué fictif en dev', async () => {
    const s = service();
    const c = await s.enregistrer(patient1, P1, soins);
    expect(c.id).toBeDefined();
    expect(c.status).toBe('active');
    expect(c.dateTime).toBe('2026-09-27T08:00:00.000Z');
    expect(c.meta?.tag?.[0]?.code).toBe('fictif');
  });

  it('refuse d’enregistrer pour un autre patient', async () => {
    await expect(service().enregistrer(patient2, P1, soins)).rejects.toBeInstanceOf(ErreurAcces);
  });

  it('refuse un partage avec un proche sans bénéficiaire (mbolo-consent-1)', async () => {
    const e = await service()
      .enregistrer(patient1, P1, { ...soins, categorie: 'C-PROCHE' })
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurValidation);
    expect((e as ErreurValidation).regles).toContain('mbolo-consent-1');
  });

  it('ouvrir le dossier à un tiers exige le niveau 2 ; le refuser ou retirer, jamais (ADR-0022)', async () => {
    const s = service();
    const niveau1: Utilisateur = { ...patient1, niveau: 1 };
    const sansNiveau: Utilisateur = { sujet: 'u-p1', roles: ['patient'], patientId: P1 };
    const partage = {
      ...soins,
      categorie: 'C-PARTAGE-PRO',
      mode: 'texte',
      beneficiaire: 'Practitioner/fictif-medecin-0001',
    } as const;
    const proche = {
      ...partage,
      categorie: 'C-PROCHE',
      beneficiaire: 'RelatedPerson/fictif-proche-0001',
    } as const;
    for (const u of [niveau1, sansNiveau]) {
      await expect(s.enregistrer(u, P1, partage)).rejects.toBeInstanceOf(ErreurNiveauInsuffisant);
      await expect(s.enregistrer(u, P1, proche)).rejects.toBeInstanceOf(ErreurNiveauInsuffisant);
      // Les autres consentements, et le refus d'un partage, restent au niveau 1.
      await expect(s.enregistrer(u, P1, soins)).resolves.toBeDefined();
      await expect(s.enregistrer(u, P1, { ...partage, accepte: false })).resolves.toBeDefined();
    }
    // Un agent IA n'a jamais de code SMS : il ne peut pas ouvrir le dossier à un tiers.
    const agent: Utilisateur = {
      sujet: 'u-agent',
      roles: ['agent-ia'],
      agent: { nom: 'agent-01-accueil', patientSession: P1 },
    };
    await expect(s.enregistrer(agent, P1, partage)).rejects.toBeInstanceOf(ErreurNiveauInsuffisant);
    await expect(s.enregistrer(patient1, P1, partage)).resolves.toBeDefined();
  });

  it('révoque avec effet immédiat et conserve la ressource (inactive)', async () => {
    const s = service();
    const c = await s.enregistrer(patient1, P1, soins);
    const r = await s.revoquer(patient1, c.id ?? '');
    expect(r.status).toBe('inactive');
    const liste = await s.lister(patient1, P1);
    expect(liste).toHaveLength(1);
    expect(liste[0]?.status).toBe('inactive');
  });

  it('un même consentement envoyé deux fois n’est gardé qu’une fois (ASVS n°3, C10)', async () => {
    const s = service();
    const partage = {
      ...soins,
      categorie: 'C-PARTAGE-PRO',
      mode: 'texte',
      beneficiaire: 'Practitioner/fictif-medecin-0001',
    } as const;
    const a = await s.enregistrer(patient1, P1, partage);
    const b = await s.enregistrer(patient1, P1, partage);
    expect(b.id).toBe(a.id);
    // Autre médecin, autre version du texte ou refus : un nouveau consentement.
    await s.enregistrer(patient1, P1, {
      ...partage,
      beneficiaire: 'Practitioner/fictif-medecin-0002',
    });
    await s.enregistrer(patient1, P1, { ...partage, versionTexte: 'C-PARTAGE-PRO v0.2 (fr)' });
    await s.enregistrer(patient1, P1, { ...partage, accepte: false });
    expect(await s.lister(patient1, P1)).toHaveLength(4);
  });

  it('un retrait ferme l’accès, même avec un doublon ou une ancienne version active (C10)', async () => {
    const depot = new DepotMemoire();
    const s = new ServiceConsentements(depot, 'dev', { estActif: async () => true });
    const partage = {
      ...soins,
      categorie: 'C-PARTAGE-PRO',
      mode: 'texte',
      beneficiaire: 'Practitioner/fictif-medecin-0001',
    } as const;
    const a = await s.enregistrer(patient1, P1, partage);
    // Doublon écrit avant la correction (ou par deux envois simultanés), et version plus récente.
    await depot.ajouter({ ...a, id: undefined });
    await s.enregistrer(patient1, P1, { ...partage, versionTexte: 'C-PARTAGE-PRO v0.2 (fr)' });
    // Partage avec un autre médecin et consentement aux soins : non concernés.
    await s.enregistrer(patient1, P1, {
      ...partage,
      beneficiaire: 'Practitioner/fictif-medecin-0002',
    });
    await s.enregistrer(patient1, P1, soins);

    await s.revoquer(patient1, a.id ?? '');
    const actifs = (await s.lister(patient1, P1)).filter((c) => c.status === 'active');
    expect(consentementActif(actifs, P1, 'C-PARTAGE-PRO', 'Practitioner/fictif-medecin-0001')).toBe(
      false,
    );
    expect(consentementActif(actifs, P1, 'C-PARTAGE-PRO', 'Practitioner/fictif-medecin-0002')).toBe(
      true,
    );
    expect(consentementActif(actifs, P1, 'C-SOINS')).toBe(true);
  });

  it('ne permet pas de révoquer le consentement d’un autre, sans révéler s’il existe', async () => {
    const s = service();
    const c = await s.enregistrer(patient1, P1, soins);
    await expect(s.revoquer(patient2, c.id ?? '')).rejects.toBeInstanceOf(ErreurAcces);
    await expect(s.revoquer(patient2, 'inexistant')).rejects.toBeInstanceOf(ErreurAcces);
  });

  it('partage avec un proche : refusé tant que le flag consentement.proche est désactivé', async () => {
    const demandes: unknown[] = [];
    const s = new ServiceConsentements(new DepotMemoire(), 'dev', {
      estActif: async (nom, contexte) => {
        demandes.push({ nom, contexte });
        return false;
      },
    });
    const e = await s
      .enregistrer(patient1, P1, {
        ...soins,
        categorie: 'C-PROCHE',
        beneficiaire: 'RelatedPerson/fictif-proche-0001',
      })
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurFonctionInactive);
    // Contexte d'évaluation sans donnée de santé : compte et type d'utilisateur.
    expect(demandes).toEqual([
      { nom: 'consentement.proche', contexte: { sujet: 'u-p1', typeUtilisateur: 'patient' } },
    ]);
    // Les autres consentements ne dépendent d'aucun flag.
    expect((await s.enregistrer(patient1, P1, soins)).status).toBe('active');
  });

  it('charte d’identité : acceptée par le patient lui-même, jamais par un agent IA (ADR-0015)', async () => {
    const s = service();
    const charte = {
      ...soins,
      categorie: 'C-IDENTITE',
      mode: 'texte',
      versionTexte: '0.1',
    } as const;
    const agent: Utilisateur = {
      sujet: 'u-agent',
      roles: ['agent-ia'],
      agent: { nom: 'agent-01-accueil', patientSession: P1 },
    };
    // L'agent peut gérer d'autres consentements dans la session du patient, pas celui-ci.
    await expect(s.enregistrer(agent, P1, charte)).rejects.toBeInstanceOf(ErreurAcces);
    const c = await s.enregistrer(patient1, P1, charte);
    expect(c.category?.[0]?.coding?.[0]?.code).toBe('C-IDENTITE');
    expect(c.policyRule?.text).toBe('0.1');
  });

  it('équipe d’assistance : révoque les seuls partages C-PROCHE du patient (ADR-0019)', async () => {
    const s = service();
    const proche = {
      ...soins,
      categorie: 'C-PROCHE',
      mode: 'texte',
      beneficiaire: 'RelatedPerson/fictif-proche-0001',
    } as const;
    await s.enregistrer(patient1, P1, proche);
    await s.enregistrer(patient1, P1, {
      ...proche,
      beneficiaire: 'RelatedPerson/fictif-proche-0002',
    });
    await s.enregistrer(patient1, P1, soins);
    const assistant: Utilisateur = { sujet: 'u-assist', roles: ['assistance-patient'] };
    // Ni un autre rôle, ni un agent IA, ni pour son propre dossier.
    for (const u of [
      patient2,
      { sujet: 'u-ia', roles: ['assistance-patient', 'agent-ia'] },
      { sujet: 'u-a2', roles: ['assistance-patient', 'patient'], patientId: P1 },
    ] as Utilisateur[]) {
      await expect(s.retirerProchesParAssistance(u, P1)).rejects.toBeInstanceOf(ErreurAcces);
    }
    expect(await s.retirerProchesParAssistance(assistant, P1)).toBe(2);
    const liste = await s.lister(patient1, P1);
    expect(liste.map((c) => [c.category?.[0]?.coding?.[0]?.code, c.status]).sort()).toEqual([
      ['C-PROCHE', 'inactive'],
      ['C-PROCHE', 'inactive'],
      ['C-SOINS', 'active'],
    ]);
    // L'équipe ne lit pas les consentements du patient.
    await expect(s.lister(assistant, P1)).rejects.toBeInstanceOf(ErreurAcces);
    expect(await s.retirerProchesParAssistance(assistant, P1)).toBe(0);
  });
});
