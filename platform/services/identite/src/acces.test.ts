import { consentement, revoquer } from '@mbolo/dossier-fhir';
import type { Consent } from 'fhir/r4.js';
import { describe, expect, it } from 'vitest';
import { deciderAccesDossier, peutGererConsentements } from './acces.js';
import type { Utilisateur } from './roles.js';

// Toutes les données sont FICTIVES.
const P1 = 'fictif-patient-0001';
const P2 = 'fictif-patient-0002';

const cons = (
  categorie: 'C-SOINS' | 'C-PARTAGE-PRO' | 'C-PROCHE',
  beneficiaire?: string,
  patientId = P1,
) =>
  consentement({
    patientId,
    categorie,
    mode: 'vocal',
    date: '2026-09-26T10:00:00Z',
    versionTexte: `${categorie} v0.1 (fr)`,
    accepte: true,
    env: 'dev',
    ...(beneficiaire ? { beneficiaire } : {}),
  });

const patient1: Utilisateur = { sujet: 'u-p1', roles: ['patient'], patientId: P1 };
const medecin: Utilisateur = {
  sujet: 'u-m1',
  roles: ['professionnel'],
  practitionerId: 'fictif-medecin-0001',
};
const autreMedecin: Utilisateur = {
  sujet: 'u-m2',
  roles: ['professionnel'],
  practitionerId: 'fictif-medecin-0002',
};
const proche: Utilisateur = {
  sujet: 'u-r1',
  roles: ['proche'],
  relatedPersonId: 'fictif-proche-0001',
};
const agent: Utilisateur = {
  sujet: 'u-a1',
  roles: ['agent-ia'],
  agent: { nom: 'agent-01-accueil', patientSession: P1 },
};

describe('patient', () => {
  it('lit son propre dossier', () => {
    expect(deciderAccesDossier(patient1, { patientId: P1 }, [])).toMatchObject({
      autorise: true,
      motif: 'patient-lui-meme',
    });
  });
  it('ne lit jamais le dossier d’un autre patient', () => {
    expect(
      deciderAccesDossier(patient1, { patientId: P2 }, [cons('C-SOINS', undefined, P2)]).autorise,
    ).toBe(false);
  });
});

describe('professionnel', () => {
  const partage = [cons('C-PARTAGE-PRO', 'Practitioner/fictif-medecin-0001')];

  it('lit le dossier si le patient a consenti au partage AVEC LUI', () => {
    expect(deciderAccesDossier(medecin, { patientId: P1 }, partage)).toMatchObject({
      autorise: true,
      motif: 'consentement-partage-pro',
    });
  });
  it('est refusé si le partage désigne un autre professionnel', () => {
    expect(deciderAccesDossier(autreMedecin, { patientId: P1 }, partage)).toMatchObject({
      autorise: false,
      motif: 'refus-sans-consentement',
    });
  });
  it('est refusé dès que le consentement est révoqué', () => {
    const revoque = partage.map((c) => revoquer(c));
    expect(deciderAccesDossier(medecin, { patientId: P1 }, revoque).autorise).toBe(false);
  });
  it('un consentement « deny » ne donne aucun accès', () => {
    const base = cons('C-PARTAGE-PRO', 'Practitioner/fictif-medecin-0001');
    const refus: Consent = { ...base, provision: { ...base.provision, type: 'deny' } };
    expect(deciderAccesDossier(medecin, { patientId: P1 }, [refus]).autorise).toBe(false);
  });
  it('bris de glace motivé : accès accordé MAIS signalé pour revue humaine', () => {
    const d = deciderAccesDossier(
      medecin,
      { patientId: P1, brisDeGlace: { motif: 'Patient inconscient au point assisté [FICTIF]' } },
      [],
    );
    expect(d).toEqual({ autorise: true, motif: 'bris-de-glace', audit: 'alerte' });
  });
  it('bris de glace sans motif réel : refusé', () => {
    expect(
      deciderAccesDossier(medecin, { patientId: P1, brisDeGlace: { motif: 'urgent' } }, []).motif,
    ).toBe('refus-bris-de-glace-sans-motif');
  });
  it('un professionnel sans identifiant Practitioner n’a aucun accès', () => {
    expect(
      deciderAccesDossier({ sujet: 'x', roles: ['professionnel'] }, { patientId: P1 }, []).autorise,
    ).toBe(false);
  });
});

describe('proche (diaspora) — « payer n’est pas voir »', () => {
  it('sans C-PROCHE qui le désigne : refusé', () => {
    expect(deciderAccesDossier(proche, { patientId: P1 }, [cons('C-SOINS')]).autorise).toBe(false);
    expect(
      deciderAccesDossier(proche, { patientId: P1 }, [
        cons('C-PROCHE', 'RelatedPerson/fictif-autre'),
      ]).autorise,
    ).toBe(false);
  });
  it('avec C-PROCHE qui le désigne : accordé', () => {
    expect(
      deciderAccesDossier(proche, { patientId: P1 }, [
        cons('C-PROCHE', 'RelatedPerson/fictif-proche-0001'),
      ]).autorise,
    ).toBe(true);
  });
});

describe('agent IA', () => {
  it('lit uniquement le patient de sa session, avec C-SOINS actif', () => {
    expect(deciderAccesDossier(agent, { patientId: P1 }, [cons('C-SOINS')]).autorise).toBe(true);
  });
  it('refusé sans consentement C-SOINS', () => {
    expect(deciderAccesDossier(agent, { patientId: P1 }, []).motif).toBe('refus-sans-consentement');
  });
  it('refusé hors de sa session, même si le patient visé a consenti', () => {
    expect(
      deciderAccesDossier(agent, { patientId: P2 }, [cons('C-SOINS', undefined, P2)]).motif,
    ).toBe('refus-agent-hors-session');
  });
  it('un agent IA ne peut pas utiliser le bris de glace', () => {
    expect(
      deciderAccesDossier(
        agent,
        { patientId: P2, brisDeGlace: { motif: 'Urgence vitale décrite par le patient' } },
        [],
      ).autorise,
    ).toBe(false);
  });
});

describe('rôles sans accès clinique', () => {
  it.each(['pharmacien', 'administrateur', 'revue-acces', 'gestion-invitations'] as const)(
    '%s : toujours refusé',
    (role) => {
      const u: Utilisateur = { sujet: 'x', roles: [role], practitionerId: 'fictif-medecin-0001' };
      expect(
        deciderAccesDossier(u, { patientId: P1 }, [
          cons('C-PARTAGE-PRO', 'Practitioner/fictif-medecin-0001'),
        ]).motif,
      ).toBe('refus-role-sans-acces-clinique');
    },
  );
  it('utilisateur sans rôle : refus par défaut', () => {
    expect(deciderAccesDossier({ sujet: 'x', roles: [] }, { patientId: P1 }, []).motif).toBe(
      'refus-par-defaut',
    );
  });
});

describe('gestion des consentements', () => {
  it('le patient gère les siens, l’agent ceux du patient de sa session, personne d’autre', () => {
    expect(peutGererConsentements(patient1, P1)).toBe(true);
    expect(peutGererConsentements(patient1, P2)).toBe(false);
    expect(peutGererConsentements(agent, P1)).toBe(true);
    expect(peutGererConsentements(agent, P2)).toBe(false);
    expect(peutGererConsentements(medecin, P1)).toBe(false);
    expect(peutGererConsentements(proche, P1)).toBe(false);
  });
});
