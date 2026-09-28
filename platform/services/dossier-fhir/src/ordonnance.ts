// Ordonnance électronique (ADR-0018, proposée ; vague 2) : une ligne de prescription par
// MedicationRequest (profil mbolo-ordonnance), les lignes d'une même ordonnance partageant un
// groupIdentifier. Rédigée par le professionnel lui-même (principe n°1) ; aucun texte libre qu'un
// agent pourrait interpréter (principe n°8) ; nomenclature des médicaments paramétrable par pays.
// La signature (Provenance) et la délivrance (MedicationDispense) viendront dans les PR suivantes.
import type { MedicationRequest } from 'fhir/r4.js';
import { CANONIQUE, PROFILS } from './constantes.js';
import { meta } from './construire.js';
import type { Environnement, Violation } from './regles.js';

/** Système des numéros d'ordonnance (groupIdentifier). */
export const SYSTEME_ORDONNANCE = `${CANONIQUE}/identifiant-ordonnance`;
/** Unités de mesure : UCUM (ex. mg, mL). */
export const UCUM = 'http://unitsofmeasure.org';
/** Renouvellements permis au plus (à confirmer par le comité médical et le juriste). */
export const RENOUVELLEMENTS_MAX = 12;

export interface Code {
  /** Système de la nomenclature du pays (ATC en attendant la liste nationale). */
  systeme: string;
  code: string;
  libelle: string;
}

export interface LigneOrdonnance {
  medicament: Code;
  /** Dose par prise, en unité UCUM (ex. 500 mg). */
  dose: { valeur: number; unite: string };
  /** Nombre de prises par période (ex. 3 fois par jour). */
  frequence: { fois: number; periode: number; unite: 'h' | 'd' | 'wk' };
  dureeJours: number;
  voie?: Code;
}

export interface OptionsOrdonnance {
  /** Numéro de l'ordonnance, commun à toutes ses lignes. */
  numero: string;
  patientId: string;
  praticienId: string;
  lignes: LigneOrdonnance[];
  /** Date de prescription (ISO 8601). */
  prescriteLe: string;
  /** Fin de validité (ISO 8601, date). */
  valableJusquau: string;
  renouvellements?: number;
  env: Environnement;
}

/** Construit les lignes d'une ordonnance, toutes vérifiées par `verifierOrdonnance`. */
export function ordonnance(o: OptionsOrdonnance): MedicationRequest[] {
  if (o.lignes.length === 0) throw new Error('Une ordonnance contient au moins une ligne.');
  return o.lignes.map((l) => ({
    resourceType: 'MedicationRequest',
    meta: meta(PROFILS.ordonnance, o.env),
    status: 'active',
    intent: 'order',
    groupIdentifier: { system: SYSTEME_ORDONNANCE, value: o.numero },
    medicationCodeableConcept: {
      coding: [
        { system: l.medicament.systeme, code: l.medicament.code, display: l.medicament.libelle },
      ],
    },
    subject: { reference: `Patient/${o.patientId}` },
    authoredOn: o.prescriteLe,
    requester: { reference: `Practitioner/${o.praticienId}` },
    dosageInstruction: [
      {
        timing: {
          repeat: {
            frequency: l.frequence.fois,
            period: l.frequence.periode,
            periodUnit: l.frequence.unite,
            boundsDuration: { value: l.dureeJours, unit: 'jours', system: UCUM, code: 'd' },
          },
        },
        ...(l.voie
          ? {
              route: {
                coding: [{ system: l.voie.systeme, code: l.voie.code, display: l.voie.libelle }],
              },
            }
          : {}),
        doseAndRate: [
          {
            doseQuantity: {
              value: l.dose.valeur,
              unit: l.dose.unite,
              system: UCUM,
              code: l.dose.unite,
            },
          },
        ],
      },
    ],
    dispenseRequest: {
      validityPeriod: { start: o.prescriteLe.slice(0, 10), end: o.valableJusquau.slice(0, 10) },
      numberOfRepeatsAllowed: o.renouvellements ?? 0,
    },
  }));
}

export function verifierOrdonnance(m: MedicationRequest): Violation[] {
  const v: Violation[] = [];
  const dosages = m.dosageInstruction ?? [];
  if (
    m.note?.length ||
    dosages.some((d) => d.text || d.patientInstruction) ||
    m.medicationCodeableConcept?.text
  ) {
    v.push({
      regle: 'mbolo-ord-1',
      message:
        'Aucun texte libre dans une ordonnance : posologie structurée et médicament codé (principe n°8).',
    });
  }
  if (
    !m.requester?.reference?.startsWith('Practitioner/') ||
    !m.subject.reference?.startsWith('Patient/')
  ) {
    v.push({
      regle: 'mbolo-ord-2',
      message:
        'Principe n°1 : une ordonnance est prescrite par un professionnel de santé, jamais par un agent IA, pour un patient.',
    });
  }
  const codage = m.medicationCodeableConcept?.coding ?? [];
  if (
    codage.length === 0 ||
    codage.some((c) => !c.system || !c.code) ||
    dosages.length === 0 ||
    dosages.some(
      (d) =>
        !d.doseAndRate?.[0]?.doseQuantity?.value ||
        !d.timing?.repeat?.frequency ||
        !d.timing.repeat.period ||
        !d.timing.repeat.boundsDuration?.value,
    )
  ) {
    v.push({
      regle: 'mbolo-ord-3',
      message: 'Médicament codé et posologie structurée (dose, fréquence, durée) obligatoires.',
    });
  }
  const validite = m.dispenseRequest?.validityPeriod;
  const renouvellements = m.dispenseRequest?.numberOfRepeatsAllowed ?? 0;
  if (
    !validite?.start ||
    !validite.end ||
    validite.end <= validite.start ||
    renouvellements < 0 ||
    renouvellements > RENOUVELLEMENTS_MAX
  ) {
    v.push({
      regle: 'mbolo-ord-4',
      message: `Période de validité obligatoire (fin après le début) et au plus ${RENOUVELLEMENTS_MAX} renouvellements.`,
    });
  }
  if (m.intent !== 'order' || m.groupIdentifier?.system !== SYSTEME_ORDONNANCE) {
    v.push({
      regle: 'mbolo-ordonnance.groupe',
      message: 'Une ligne d’ordonnance porte le numéro de son ordonnance (intent « order »).',
    });
  }
  return v;
}
