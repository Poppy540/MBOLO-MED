import type { Condition, Consent } from 'fhir/r4.js';
import { describe, expect, it } from 'vitest';
import { conditionDeclaree, consentement, provenanceAgent } from './construire.js';
import { SYSTEMES } from './constantes.js';
import { valider, verifierCondition, verifierConsent } from './regles.js';

// Toutes les données sont FICTIVES.
const regles = (v: { regle: string }[]) => v.map((x) => x.regle);

const declaree = () =>
  conditionDeclaree({
    patientId: 'fictif-patient-0001',
    texte: 'Toux (déclaré) [FICTIF]',
    date: '2026-09-26',
    declarant: 'Patient/fictif-patient-0001',
    env: 'dev',
  });

describe('Condition — principe n°1 (mbolo-cond-1)', () => {
  it('accepte un problème déclaré, non confirmé', () => {
    expect(valider(declaree(), 'dev')).toEqual([]);
  });

  it('refuse un diagnostic confirmé dont l’auteur est le patient', () => {
    const c: Condition = {
      ...declaree(),
      verificationStatus: {
        coding: [{ system: SYSTEMES.conditionVerification, code: 'confirmed' }],
      },
    };
    expect(regles(verifierCondition(c))).toContain('mbolo-cond-1');
  });

  it('refuse un diagnostic de consultation posé par un agent IA (Device)', () => {
    const c: Condition = {
      ...declaree(),
      category: [
        { coding: [{ system: SYSTEMES.conditionCategorie, code: 'encounter-diagnosis' }] },
      ],
      asserter: { reference: 'Device/agent-01-accueil' } as Condition['asserter'],
    };
    expect(regles(verifierCondition(c))).toContain('mbolo-cond-1');
  });

  it('accepte un diagnostic confirmé posé par un professionnel', () => {
    const c: Condition = {
      ...declaree(),
      verificationStatus: {
        coding: [{ system: SYSTEMES.conditionVerification, code: 'confirmed' }],
      },
      asserter: { reference: 'Practitioner/fictif-medecin-0001' },
    };
    expect(verifierCondition(c)).toEqual([]);
  });

  it('exige statut de vérification, catégorie, code, date et auteur', () => {
    const c: Condition = {
      resourceType: 'Condition',
      subject: { reference: 'Patient/fictif-patient-0001' },
    };
    expect(regles(verifierCondition(c))).toEqual([
      'mbolo-condition.verificationStatus',
      'mbolo-condition.category',
      'mbolo-condition.code',
      'mbolo-condition.recordedDate',
      'mbolo-condition.asserter',
    ]);
  });

  it('le constructeur refuse un professionnel comme déclarant d’une déclaration patient', () => {
    expect(() =>
      conditionDeclaree({
        patientId: 'fictif-patient-0001',
        texte: 'x',
        date: '2026-09-26',
        declarant: 'Practitioner/fictif-medecin-0001',
        env: 'dev',
      }),
    ).toThrow();
  });
});

describe('Consent', () => {
  const base = () =>
    consentement({
      patientId: 'fictif-patient-0001',
      categorie: 'C-SOINS',
      mode: 'vocal',
      date: '2026-09-26T10:15:00+01:00',
      versionTexte: 'C-SOINS v0.1 (fr)',
      accepte: true,
      env: 'dev',
    });

  it('accepte un consentement complet', () => {
    expect(valider(base(), 'dev')).toEqual([]);
  });

  it('un refus produit provision.type = deny', () => {
    const refus = consentement({
      patientId: 'fictif-patient-0001',
      categorie: 'C-PROCHE',
      mode: 'texte',
      date: '2026-09-26T10:15:00+01:00',
      versionTexte: 'C-PROCHE v0.1 (fr)',
      accepte: false,
      env: 'dev',
    });
    expect(refus.provision?.type).toBe('deny');
  });

  it('refuse une catégorie inconnue ou un consentement groupé', () => {
    const inconnu: Consent = {
      ...base(),
      category: [{ coding: [{ system: SYSTEMES.consentement, code: 'TOUT-ACCEPTER' }] }],
    };
    const groupe: Consent = {
      ...base(),
      category: [
        { coding: [{ system: SYSTEMES.consentement, code: 'C-SOINS' }] },
        { coding: [{ system: SYSTEMES.consentement, code: 'C-PROCHE' }] },
      ],
    };
    expect(regles(verifierConsent(inconnu))).toContain('mbolo-consent.category');
    expect(regles(verifierConsent(groupe))).toContain('mbolo-consent.category');
  });

  it('exige la version du texte présenté', () => {
    const sansTexte: Consent = { ...base() };
    delete sansTexte.policyRule;
    expect(regles(verifierConsent(sansTexte))).toContain('mbolo-consent.policyRule');
  });
});

describe('Provenance', () => {
  it('accepte une écriture d’agent avec cible et type', () => {
    const p = provenanceAgent({
      cibles: ['Condition/fictif-condition-0001'],
      agent: 'Agent 1 (assistant IA)',
      date: '2026-09-26T10:20:00+01:00',
      env: 'dev',
    });
    expect(valider(p, 'dev')).toEqual([]);
  });
});

describe('Principe n°4 — marqueur fictif hors production', () => {
  it('refuse en dev une ressource sans marqueur fictif', () => {
    const sansMeta: Condition = { ...declaree() };
    delete sansMeta.meta;
    expect(regles(valider(sansMeta, 'dev'))).toContain('mbolo-fictif');
    expect(regles(valider(sansMeta, 'recette'))).toContain('mbolo-fictif');
  });

  it('en production, le constructeur ne pose pas le marqueur et la règle ne l’exige pas', () => {
    const c = conditionDeclaree({
      patientId: 'p1',
      texte: 'x',
      date: '2026-09-26',
      declarant: 'Patient/p1',
      env: 'prod',
    });
    expect(c.meta?.tag).toBeUndefined();
    expect(valider(c, 'prod')).toEqual([]);
  });
});
