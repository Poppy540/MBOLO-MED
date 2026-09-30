// Règles de validation Mbolo Santé, appliquées AVANT l'envoi au serveur FHIR.
// Elles reprennent les profils de ig/ (cardinalités, invariant mbolo-cond-1) pour détecter
// les erreurs au plus tôt, notamment dans les outils utilisés par les agents IA.
// Le serveur FHIR et le validateur officiel restent la référence (CI : job « FHIR »).
import type {
  Appointment,
  Composition,
  Schedule,
  Slot,
  CodeableConcept,
  Condition,
  Consent,
  FhirResource,
  Patient,
  Provenance,
  Reference,
} from 'fhir/r4.js';
import { verifierOrdonnance } from './ordonnance.js';
import { verifierProche } from './proche.js';
import { verifierTelephones } from './telephone.js';
import {
  AUTEURS_ANNULATION,
  CATEGORIES_AVEC_BENEFICIAIRE,
  EXTENSION_DATE_ANNULATION,
  EXTENSION_STATUT_IDENTITE,
  STATUTS_IDENTITE,
  SECTIONS_COMPTE_RENDU,
  CATEGORIES_CONSENTEMENT,
  MARQUEUR_FICTIF,
  SYSTEMES,
} from './constantes.js';

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
  const partage = codes.some((x) =>
    (CATEGORIES_AVEC_BENEFICIAIRE as readonly string[]).includes(x.code ?? ''),
  );
  if (partage && !c.provision?.actor?.some((a) => a.reference?.reference)) {
    v.push({
      regle: 'mbolo-consent-1',
      message: 'Un consentement de partage doit désigner son bénéficiaire (provision.actor).',
    });
  }
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

export function verifierAppointment(a: Appointment): Violation[] {
  const v: Violation[] = [];
  if (
    a.reasonCode?.length ||
    a.reasonReference?.length ||
    a.supportingInformation?.length ||
    a.description ||
    a.comment ||
    a.patientInstruction
  ) {
    v.push({
      regle: 'mbolo-rdv-1',
      message: 'Un rendez-vous ne contient ni motif, ni pièce, ni texte libre (minimisation).',
    });
  }
  const acteurs = (a.participant ?? []).map((p) => p.actor?.reference ?? '');
  const patients = acteurs.filter((r) => r.startsWith('Patient/')).length;
  const praticiens = acteurs.filter((r) => r.startsWith('Practitioner/')).length;
  if (acteurs.length !== 2 || patients !== 1 || praticiens !== 1) {
    v.push({
      regle: 'mbolo-rdv-2',
      message: 'Exactement un patient et un professionnel de santé.',
    });
  }
  if (a.status === 'cancelled') {
    const auteur = a.cancelationReason?.coding ?? [];
    const valide =
      auteur.length === 1 &&
      auteur[0]?.system === SYSTEMES.annulation &&
      (AUTEURS_ANNULATION as readonly string[]).includes(auteur[0].code ?? '');
    const date = (a.extension ?? []).some(
      (e) => e.url === EXTENSION_DATE_ANNULATION && !!e.valueDateTime,
    );
    if (!valide || a.cancelationReason?.text || !date) {
      v.push({
        regle: 'mbolo-rdv-4',
        message: 'Une annulation indique qui a annulé (code, sans texte libre) et quand.',
      });
    }
  }
  const codes = (a.serviceType ?? []).flatMap((s) => s.coding ?? []);
  if (codes.length !== 1 || codes[0]?.system !== SYSTEMES.modeConsultation) {
    v.push({
      regle: 'mbolo-rendez-vous.serviceType',
      message: 'Mode de consultation obligatoire.',
    });
  }
  if (!a.start || !a.end || !a.minutesDuration) {
    v.push({
      regle: 'mbolo-rendez-vous.creneau',
      message: 'Début, fin et durée obligatoires.',
    });
  } else if (new Date(a.end).getTime() <= new Date(a.start).getTime()) {
    v.push({ regle: 'mbolo-rdv-3', message: 'La fin doit suivre le début.' });
  }
  return v;
}

const estVideo = (codes: CodeableConcept[] | undefined) => {
  const c = (codes ?? []).flatMap((s) => s.coding ?? []);
  return c.length === 1 && c[0]?.system === SYSTEMES.modeConsultation;
};

export function verifierSchedule(s: Schedule): Violation[] {
  const v: Violation[] = [];
  const acteurs = s.actor ?? [];
  if (acteurs.length !== 1 || !acteurs[0]?.reference?.startsWith('Practitioner/')) {
    v.push({ regle: 'mbolo-agenda-1', message: 'Un agenda appartient à un seul professionnel.' });
  }
  if (s.active === undefined)
    v.push({ regle: 'mbolo-agenda.active', message: 'Statut actif obligatoire.' });
  if (!estVideo(s.serviceType))
    v.push({ regle: 'mbolo-agenda.serviceType', message: 'Mode de consultation obligatoire.' });
  if (s.comment) v.push({ regle: 'mbolo-agenda.comment', message: 'Aucun texte libre.' });
  return v;
}

export function verifierSlot(s: Slot): Violation[] {
  const v: Violation[] = [];
  if (s.comment) {
    v.push({ regle: 'mbolo-creneau-1', message: 'Un créneau ne contient aucun texte libre.' });
  }
  if (!s.schedule?.reference?.startsWith('Schedule/'))
    v.push({ regle: 'mbolo-creneau.schedule', message: 'Agenda obligatoire.' });
  if (!estVideo(s.serviceType))
    v.push({ regle: 'mbolo-creneau.serviceType', message: 'Mode de consultation obligatoire.' });
  if (new Date(s.end).getTime() <= new Date(s.start).getTime())
    v.push({ regle: 'mbolo-creneau-2', message: 'La fin doit suivre le début.' });
  return v;
}

export function verifierComposition(c: Composition): Violation[] {
  const v: Violation[] = [];
  const auteurs = c.author ?? [];
  if (auteurs.length !== 1 || !auteurs[0]?.reference?.startsWith('Practitioner/')) {
    v.push({
      regle: 'mbolo-cr-1',
      message:
        'Principe n°1 : un compte-rendu est rédigé par un seul professionnel de santé, jamais par un agent IA.',
    });
  }
  const sections = c.section ?? [];
  if (sections.length === 0 || sections.some((s) => !s.text?.div)) {
    v.push({ regle: 'mbolo-cr-2', message: 'Chaque section porte un texte.' });
  }
  const codes = sections.flatMap((s) => s.code?.coding ?? []);
  if (
    codes.some(
      (k) =>
        k.system !== SYSTEMES.sectionCompteRendu ||
        !(SECTIONS_COMPTE_RENDU as readonly string[]).includes(k.code ?? ''),
    )
  ) {
    v.push({ regle: 'mbolo-compte-rendu.section', message: 'Section inconnue.' });
  }
  if (!c.subject?.reference?.startsWith('Patient/')) {
    v.push({ regle: 'mbolo-compte-rendu.subject', message: 'Patient obligatoire.' });
  }
  const type = c.type.coding?.[0];
  if (type?.system !== SYSTEMES.typeDocument || type.code !== 'compte-rendu-teleconsultation') {
    v.push({ regle: 'mbolo-compte-rendu.type', message: 'Type de document inconnu.' });
  }
  return v;
}

/** Profil mbolo-patient (ADR-0014) : identité minimale et statut de vérification. */
export function verifierPatient(p: Patient): Violation[] {
  const v: Violation[] = [];
  if (!(p.name ?? []).some((n) => n.family && (n.given ?? []).length > 0)) {
    v.push({ regle: 'mbolo-pat-1', message: 'Nom et prénom obligatoires.' });
  }
  if (!p.birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(p.birthDate)) {
    v.push({
      regle: 'mbolo-patient.birthDate',
      message: 'Date de naissance obligatoire (AAAA-MM-JJ).',
    });
  } else if (new Date(`${p.birthDate}T00:00:00Z`).getTime() > Date.now()) {
    v.push({ regle: 'mbolo-patient.birthDate', message: 'Date de naissance dans le futur.' });
  }
  const statuts = (p.extension ?? []).filter((e) => e.url === EXTENSION_STATUT_IDENTITE);
  const statut = statuts[0]?.valueCode;
  if (statuts.length !== 1 || !(STATUTS_IDENTITE as readonly string[]).includes(statut ?? '')) {
    v.push({
      regle: 'mbolo-patient.statutIdentite',
      message: 'Un et un seul statut de vérification d’identité connu.',
    });
  }
  const identifiantType = (p.identifier ?? []).some((i) =>
    (i.type?.coding ?? []).some((c) => c.system === SYSTEMES.typeIdentifiantPatient),
  );
  if (statut === 'verifiee' && !identifiantType) {
    v.push({
      regle: 'mbolo-pat-2',
      message: 'Une identité vérifiée exige un numéro d’assurance maladie ou provisoire.',
    });
  }
  v.push(...verifierTelephones(p.telecom));
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
      case 'Appointment':
        return verifierAppointment(r);
      case 'Schedule':
        return verifierSchedule(r);
      case 'Slot':
        return verifierSlot(r);
      case 'Composition':
        return verifierComposition(r);
      case 'Patient':
        return verifierPatient(r);
      case 'MedicationRequest':
        return verifierOrdonnance(r);
      case 'RelatedPerson':
        return verifierProche(r);
      default:
        return [];
    }
  })();
  return [...specifiques, ...verifierMarqueurFictif(r, env)];
}
