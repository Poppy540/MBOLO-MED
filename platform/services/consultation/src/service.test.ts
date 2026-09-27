import type { Appointment, Composition, Condition } from 'fhir/r4.js';
import type { Utilisateur } from '@mbolo/identite';
import { describe, expect, it } from 'vitest';
import type { DecideurAcces } from './acces.js';
import type { Dossier } from './dossier.js';
import { ErreurConsultation, ServiceConsultation } from './service.js';

// Données FICTIVES.
const medecin: Utilisateur = {
  sujet: 'u-m1',
  roles: ['professionnel'],
  practitionerId: 'prac-fictif-001',
};
const autreMedecin: Utilisateur = {
  sujet: 'u-m2',
  roles: ['professionnel'],
  practitionerId: 'prac-fictif-002',
};
const agentIa: Utilisateur = { sujet: 'agent-01', roles: ['agent-ia'] };

const rdv: Appointment = {
  resourceType: 'Appointment',
  id: 'rdv-fictif-1',
  status: 'booked',
  start: '2026-10-01T08:00:00Z',
  participant: [
    { actor: { reference: 'Patient/pat-fictif-001' }, status: 'accepted' },
    { actor: { reference: 'Practitioner/prac-fictif-001' }, status: 'accepted' },
  ],
};

function monter(o: { autorise?: boolean; heure?: string; rendezVous?: Appointment } = {}) {
  const decisions: { jeton: string; patientId: string; brisDeGlace?: unknown }[] = [];
  const ecrits: Composition[] = [];
  const acces: DecideurAcces = {
    decider: async (jeton, patientId, brisDeGlace) => {
      decisions.push({ jeton, patientId, ...(brisDeGlace ? { brisDeGlace } : {}) });
      return o.autorise === false
        ? { autorise: false, motif: 'refus-sans-consentement' }
        : { autorise: true, motif: brisDeGlace ? 'bris-de-glace' : 'consentement-partage-pro' };
    },
  };
  const probleme: Condition = {
    resourceType: 'Condition',
    subject: { reference: 'Patient/pat-fictif-001' },
    code: { text: '[FICTIF] Toux déclarée' },
    verificationStatus: { coding: [{ code: 'unconfirmed' }] },
    asserter: { reference: 'Patient/pat-fictif-001' },
  };
  const dossier: Dossier = {
    rendezVous: async (id) => (id === 'rdv-fictif-1' ? (o.rendezVous ?? rdv) : undefined),
    problemes: async () => [probleme],
    comptesRendus: async () => ecrits,
    ajouterCompteRendu: async (c) => {
      const cree = { ...c, id: `cr-${ecrits.length + 1}` };
      ecrits.push(cree);
      return cree;
    },
  };
  const service = new ServiceConsultation(
    acces,
    dossier,
    'dev',
    () => new Date(o.heure ?? '2026-10-01T08:10:00Z'),
  );
  return { service, decisions, ecrits };
}

describe('lecture du dossier', () => {
  it('seulement après décision favorable d’identite, prise avec le jeton du demandeur', async () => {
    const { service, decisions } = monter();
    const d = await service.dossier('jeton-medecin', 'pat-fictif-001');
    expect(decisions).toEqual([{ jeton: 'jeton-medecin', patientId: 'pat-fictif-001' }]);
    expect(d.motifAcces).toBe('consentement-partage-pro');
    expect(d.problemes).toEqual([
      { texte: '[FICTIF] Toux déclarée', verification: 'unconfirmed', parProfessionnel: false },
    ]);
  });

  it('refus d’identite : 403 avec le motif, et rien n’est lu', async () => {
    const e = await monter({ autorise: false })
      .service.dossier('jeton', 'pat-fictif-001')
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurConsultation);
    expect(e).toMatchObject({ statut: 403, motif: 'refus-sans-consentement' });
  });

  it('transmet le bris de glace motivé à identite', async () => {
    const { service, decisions } = monter();
    const d = await service.dossier('j', 'pat-fictif-001', { motif: '[FICTIF] urgence vitale' });
    expect(decisions[0]?.brisDeGlace).toEqual({ motif: '[FICTIF] urgence vitale' });
    expect(d.motifAcces).toBe('bris-de-glace');
  });
});

describe('compte-rendu', () => {
  const sections = { motif: '[FICTIF] Toux', conclusion: '[FICTIF] Conclusion' };

  it('le médecin du rendez-vous l’écrit ; il est relu dans le dossier', async () => {
    const { service, ecrits, decisions } = monter();
    const r = await service.ecrireCompteRendu(medecin, 'jeton-m', 'rdv-fictif-1', sections);
    expect(r.id).toBe('cr-1');
    expect(ecrits[0]?.author).toEqual([{ reference: 'Practitioner/prac-fictif-001' }]);
    expect(decisions).toEqual([{ jeton: 'jeton-m', patientId: 'pat-fictif-001' }]);
    const d = await service.dossier('jeton-m', 'pat-fictif-001');
    expect(d.comptesRendus[0]?.sections).toEqual(sections);
  });

  it('refuse un agent IA ou un autre médecin, sans révéler le rendez-vous', async () => {
    const { service, ecrits } = monter();
    await expect(
      service.ecrireCompteRendu(agentIa, 'j', 'rdv-fictif-1', sections),
    ).rejects.toMatchObject({ statut: 403 });
    await expect(
      service.ecrireCompteRendu(autreMedecin, 'j', 'rdv-fictif-1', sections),
    ).rejects.toMatchObject({ statut: 404, message: 'Rendez-vous introuvable.' });
    expect(ecrits).toEqual([]);
  });

  it('refuse sans consentement, avant la consultation, sur un rendez-vous annulé, ou vide', async () => {
    await expect(
      monter({ autorise: false }).service.ecrireCompteRendu(medecin, 'j', 'rdv-fictif-1', sections),
    ).rejects.toMatchObject({ statut: 403 });
    await expect(
      monter({ heure: '2026-10-01T07:00:00Z' }).service.ecrireCompteRendu(
        medecin,
        'j',
        'rdv-fictif-1',
        sections,
      ),
    ).rejects.toMatchObject({ statut: 409 });
    await expect(
      monter({ rendezVous: { ...rdv, status: 'cancelled' } }).service.ecrireCompteRendu(
        medecin,
        'j',
        'rdv-fictif-1',
        sections,
      ),
    ).rejects.toMatchObject({ statut: 409 });
    await expect(
      monter().service.ecrireCompteRendu(medecin, 'j', 'rdv-fictif-1', { motif: '  ' }),
    ).rejects.toMatchObject({ statut: 400 });
  });
});
