// Règles de validation Mbolo Santé, appliquées AVANT l'envoi au serveur FHIR.
// Elles reprennent les profils de ig/ (cardinalités, invariant mbolo-cond-1) pour détecter
// les erreurs au plus tôt, notamment dans les outils utilisés par les agents IA.
// Le serveur FHIR et le validateur officiel restent la référence (CI : job « FHIR »).
import type {
  CodeableConcept,
  Condition,
  Consent,
  FhirResource,
  Provenance,
  Reference,
} from 'fhir/r4.js';
import { CATEGORIES_CONSENTEMENT, MARQUEUR_FICTIF, SYSTEMES } from './constantes.js';

export interface Violation {
  regle: string;
  message: string;
}

export type Environnement = 'dev' | 'recette' | 'prod';

const estProfessionnel = (ref: Reference | undefined): boolean =>
  ref?.reference?.startsWith('Practitioner') === true;

const aCode = (codes: CodeableConcept[] | undefined, code: string) =>
  (codes ?? []).some((c) => (c.coding ?? []).some((x) => x.code === code));

export function verifierCondition(c: Condition): Violation[] {
  const v: Violation[] = [];
  if (!c.verificationStatus) {
    v.push({
      regle: 'mbolo-condition.verificationStatus',
      message: 'Statut de vérification obligatoire.',
    });
  }
  if (!c.category?.length)
    v.push({ regle: 'mbolo-condition.category', message: 'Catégorie obligatoire.' });
  if (!c.code)
    v.push({ regle: 'mbolo-condition.code', message: 'Code ou texte du problème obligatoire.' });
  if (!c.recordedDate)
    v.push({
      regle: 'mbolo-condition.recordedDate',
      message: "Date d'enregistrement obligatoire.",
    });
  if (!c.asserter)
    v.push({ regle: 'mbolo-condition.asserter', message: 'Auteur de la déclaration obligatoire.' });

  const confirme = c.verificationStatus ? aCode([c.verificationStatus], 'confirmed') : false;
  const diagnosticConsultation = aCode(c.category, 'encounter-diagnosis');
  if ((confirme || diagnosticConsultation) && !estProfessionnel(c.asserter)) {
    v.push({
      regle: 'mbolo-cond-1',
      message:
        'Principe n°1 : seul un professionnel de santé peut poser un diagnostic confirmé ou de consultation.',
    });
  }
  return v;
}

export function verifierConsent(c: Consent): Violation[] {
  const v: Violation[] = [];
  const codes = (c.category ?? []).flatMap((cat) => cat.coding ?? []);
  if (codes.length !== 1) {
    v.push({
      regle: 'mbolo-consent.category',
      message: 'Exactement une catégorie de consentement.',
    });
  } else {
    const [code] = codes;
    const valide =
      code?.system === SYSTEMES.consentement &&
      (CATEGORIES_CONSENTEMENT as readonly string[]).includes(code.code ?? '');
    if (!valide)
      v.push({ regle: 'mbolo-consent.category', message: 'Catégorie de consentement inconnue.' });
  }
  if (!c.patient) v.push({ regle: 'mbolo-consent.patient', message: 'Patient obligatoire.' });
  if (!c.dateTime)
    v.push({ regle: 'mbolo-consent.dateTime', message: 'Date du consentement obligatoire.' });
  if (!c.policyRule)
    v.push({
      regle: 'mbolo-consent.policyRule',
      message: 'Version du texte présenté obligatoire.',
    });
  if (!c.provision?.type)
    v.push({ regle: 'mbolo-consent.provision', message: 'Type (permit / deny) obligatoire.' });
  return v;
}

export function verifierProvenance(p: Provenance): Violation[] {
  const v: Violation[] = [];
  if (!p.target?.length)
    v.push({ regle: 'mbolo-provenance.target', message: 'Cible obligatoire.' });
  if (!p.agent?.length || p.agent.some((a) => !a.type)) {
    v.push({ regle: 'mbolo-provenance.agent', message: 'Au moins un agent, avec son type.' });
  }
  return v;
}

/** Principe n°4 : hors production, toute donnée doit porter le marqueur « fictif ». */
export function verifierMarqueurFictif(r: FhirResource, env: Environnement): Violation[] {
  if (env === 'prod') return [];
  const marque = (r.meta?.tag ?? []).some(
    (t) => t.system === MARQUEUR_FICTIF.system && t.code === MARQUEUR_FICTIF.code,
  );
  return marque
    ? []
    : [
        {
          regle: 'mbolo-fictif',
          message: `Hors production, la ressource doit porter le marqueur fictif (${env}).`,
        },
      ];
}

export function valider(r: FhirResource, env: Environnement): Violation[] {
  const specifiques = (() => {
    switch (r.resourceType) {
      case 'Condition':
        return verifierCondition(r);
      case 'Consent':
        return verifierConsent(r);
      case 'Provenance':
        return verifierProvenance(r);
      default:
        return [];
    }
  })();
  return [...specifiques, ...verifierMarqueurFictif(r, env)];
}
