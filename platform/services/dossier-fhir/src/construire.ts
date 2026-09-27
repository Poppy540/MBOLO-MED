// Constructeurs de ressources conformes aux profils Mbolo Santé.
// Ils rendent impossible, par construction, les écarts les plus graves (ex. un agent IA qui
// enregistrerait un diagnostic confirmé).
import type { Condition, Consent, Provenance } from 'fhir/r4.js';
import {
  EXTENSION_MODE_RECUEIL,
  MARQUEUR_FICTIF,
  PROFILS,
  SYSTEMES,
  type CategorieConsentement,
  type ModeRecueil,
} from './constantes.js';
import type { Environnement } from './regles.js';

const meta = (profil: string, env: Environnement) => ({
  profile: [profil],
  ...(env === 'prod' ? {} : { tag: [MARQUEUR_FICTIF] }),
});

export interface OptionsConditionDeclaree {
  patientId: string;
  texte: string;
  date: string;
  /** Qui déclare : le patient lui-même (référence Patient) ou un proche (RelatedPerson). */
  declarant: string;
  env: Environnement;
}

/** Problème déclaré par le patient : toujours « unconfirmed », jamais un diagnostic. */
export function conditionDeclaree(o: OptionsConditionDeclaree): Condition {
  if (o.declarant.startsWith('Practitioner')) {
    throw new Error(
      'Une déclaration de patient ne peut pas avoir un professionnel comme déclarant.',
    );
  }
  return {
    resourceType: 'Condition',
    meta: meta(PROFILS.condition, o.env),
    clinicalStatus: { coding: [{ system: SYSTEMES.conditionClinique, code: 'active' }] },
    verificationStatus: {
      coding: [{ system: SYSTEMES.conditionVerification, code: 'unconfirmed' }],
    },
    category: [{ coding: [{ system: SYSTEMES.conditionCategorie, code: 'problem-list-item' }] }],
    code: { text: o.texte },
    subject: { reference: `Patient/${o.patientId}` },
    recordedDate: o.date,
    asserter: { reference: o.declarant },
  };
}

export interface OptionsConsentement {
  patientId: string;
  categorie: CategorieConsentement;
  mode: ModeRecueil;
  date: string;
  versionTexte: string;
  accepte: boolean;
  env: Environnement;
  /**
   * Bénéficiaire du partage (ex. « Practitioner/… », « RelatedPerson/… »).
   * Obligatoire pour C-PARTAGE-PRO et C-PROCHE (invariant mbolo-consent-1).
   */
  beneficiaire?: string;
}

export function consentement(o: OptionsConsentement): Consent {
  return {
    resourceType: 'Consent',
    meta: meta(PROFILS.consent, o.env),
    extension: [{ url: EXTENSION_MODE_RECUEIL, valueCode: o.mode }],
    status: 'active',
    scope: { coding: [{ system: SYSTEMES.consentScope, code: 'patient-privacy' }] },
    category: [{ coding: [{ system: SYSTEMES.consentement, code: o.categorie }] }],
    patient: { reference: `Patient/${o.patientId}` },
    dateTime: o.date,
    policyRule: { text: o.versionTexte },
    provision: {
      type: o.accepte ? 'permit' : 'deny',
      purpose: [{ system: SYSTEMES.actReason, code: 'TREAT' }],
      ...(o.beneficiaire
        ? {
            actor: [
              {
                role: { coding: [{ system: SYSTEMES.participationType, code: 'IRCP' }] },
                reference: { reference: o.beneficiaire },
              },
            ],
          }
        : {}),
    },
  };
}

/** Révocation : la ressource est conservée (traçabilité) et passe au statut « inactive ». */
export function revoquer(c: Consent): Consent {
  return { ...c, status: 'inactive' };
}

export interface OptionsProvenanceAgent {
  cibles: string[];
  agent: string;
  date: string;
  env: Environnement;
}

export function provenanceAgent(o: OptionsProvenanceAgent): Provenance {
  return {
    resourceType: 'Provenance',
    meta: meta(PROFILS.provenance, o.env),
    target: o.cibles.map((reference) => ({ reference })),
    recorded: o.date,
    agent: [
      {
        type: { coding: [{ system: SYSTEMES.provenanceType, code: 'author' }] },
        who: { display: o.agent },
      },
    ],
  };
}
