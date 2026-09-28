// Proche invité par le patient (ADR-0019) : fiche RelatedPerson minimale, rattachée au patient.
// Minimisation (principe n°3) : le prénom, pour que le patient le reconnaisse, et le lien, codé.
// Jamais de nom, de téléphone, d'adresse, de date de naissance ni d'identifiant : le proche n'est
// pas soigné, et le numéro qui reçoit le code d'invitation n'est pas gardé.
// La fiche est créée inactive à l'invitation, puis activée quand le proche crée son compte.
import type { RelatedPerson } from 'fhir/r4.js';
import { meta } from './construire.js';
import { PROFILS } from './constantes.js';
import type { Environnement, Violation } from './regles.js';

export const SYSTEME_LIEN = 'http://terminology.hl7.org/CodeSystem/v3-RoleCode';

/** Liens proposés au patient (codes v3-RoleCode) ; libellés dans la langue de l'application. */
export const LIENS_PROCHE = ['CHILD', 'SPS', 'SIB', 'PRN', 'FAMMEMB', 'FRND'] as const;
export type LienProche = (typeof LIENS_PROCHE)[number];

/** Longueur maximale du prénom saisi par le patient. */
export const PRENOM_MAX = 60;

export interface OptionsProche {
  patientId: string;
  prenom: string;
  lien: LienProche;
  /** Faux à l'invitation ; vrai quand le proche a créé son compte. */
  actif: boolean;
  env: Environnement;
}

export function procheInvite(o: OptionsProche): RelatedPerson {
  return {
    resourceType: 'RelatedPerson',
    meta: meta(PROFILS.proche, o.env),
    active: o.actif,
    patient: { reference: `Patient/${o.patientId}` },
    relationship: [{ coding: [{ system: SYSTEME_LIEN, code: o.lien }] }],
    name: [{ given: [o.prenom.trim()] }],
  };
}

/** Éléments permis : tout autre élément (télécom, adresse, naissance…) est refusé. */
const PERMIS = new Set(['resourceType', 'id', 'meta', 'active', 'patient', 'relationship', 'name']);

export function verifierProche(r: RelatedPerson): Violation[] {
  const v: Violation[] = [];
  if (!/^Patient\/[A-Za-z0-9\-.]{1,64}$/.test(r.patient.reference ?? '')) {
    v.push({ regle: 'mbolo-proche-1', message: 'Le proche est rattaché à un patient.' });
  }
  const interdits = Object.keys(r).filter((k) => !PERMIS.has(k));
  const nom = r.name ?? [];
  const prenom = nom[0]?.given?.[0] ?? '';
  const nomMinimal =
    nom.length === 1 &&
    Object.keys(nom[0] ?? {}).every((k) => k === 'given') &&
    nom[0]?.given?.length === 1 &&
    prenom.trim().length > 0 &&
    prenom.length <= PRENOM_MAX;
  if (interdits.length > 0 || !nomMinimal) {
    v.push({
      regle: 'mbolo-proche-2',
      message: `Fiche du proche minimale : prénom et lien seulement (refusé : ${
        interdits.join(', ') || 'nom'
      }).`,
    });
  }
  const liens = r.relationship ?? [];
  const lienValide =
    liens.length === 1 &&
    liens[0]?.coding?.length === 1 &&
    liens[0].coding[0]?.system === SYSTEME_LIEN &&
    (LIENS_PROCHE as readonly string[]).includes(liens[0].coding[0]?.code ?? '');
  if (!lienValide) {
    v.push({
      regle: 'mbolo-proche-3',
      message: 'Lien avec le patient codé, dans la liste permise.',
    });
  }
  return v;
}
