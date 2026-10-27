// Professionnel de santé et statut de sa vérification (ADR-0026, proposée).
// La fiche est créée inactive (« a-verifier ») ; seule la décision « verifie » d'une personne
// habilitée (rôle verification-professionnels, jamais un agent IA) permet au serveur de l'activer.
// Annuaire et créneaux sont réservés aux professionnels vérifiés dont l'inscription est en cours
// de validité (praticienVerifie).
import type { Practitioner, PractitionerQualification } from 'fhir/r4.js';
import { meta } from './construire.js';
import { CANONIQUE, PROFILS } from './constantes.js';
import type { Environnement, Violation } from './regles.js';

export const EXTENSION_STATUT_VERIFICATION = `${CANONIQUE}/StructureDefinition/statut-verification`;

/** Seul « verifie » ouvre l'annuaire et les créneaux. */
export const STATUTS_VERIFICATION_PRO = ['a-verifier', 'verifie', 'refuse', 'suspendu'] as const;
export type StatutVerificationPro = (typeof STATUTS_VERIFICATION_PRO)[number];

/** Inscription à l'Ordre vérifiée à la source : numéro, Ordre émetteur, période de validité. */
export interface Inscription {
  specialite: string;
  numero: string;
  ordre: string;
  /** Dates (AAAA-MM-JJ) ; la fin fixe la prochaine vérification. */
  debut: string;
  fin: string;
}

export interface OptionsPraticien {
  nom: string;
  prenom: string;
  statut: StatutVerificationPro;
  /** Obligatoire pour « verifie ». */
  inscription?: Inscription;
  env: Environnement;
}

export function praticien(o: OptionsPraticien): Practitioner {
  const i = o.inscription;
  return {
    resourceType: 'Practitioner',
    meta: meta(PROFILS.praticien, o.env),
    extension: [{ url: EXTENSION_STATUT_VERIFICATION, valueCode: o.statut }],
    // Actif seulement une fois vérifié (mbolo-prat-1).
    active: o.statut === 'verifie',
    name: [{ family: o.nom, given: [o.prenom] }],
    ...(i
      ? {
          qualification: [
            {
              code: { text: i.specialite },
              identifier: [{ value: i.numero }],
              issuer: { display: i.ordre },
              period: { start: i.debut, end: i.fin },
            },
          ],
        }
      : {}),
  };
}

export function statutVerification(p: Practitioner): StatutVerificationPro | undefined {
  const code = p.extension?.find((e) => e.url === EXTENSION_STATUT_VERIFICATION)?.valueCode;
  return (STATUTS_VERIFICATION_PRO as readonly string[]).includes(code ?? '')
    ? (code as StatutVerificationPro)
    : undefined;
}

const inscriptionComplete = (q: PractitionerQualification): boolean =>
  Boolean(q.identifier?.some((x) => x.value) && q.issuer && q.period?.end);

/**
 * Le professionnel peut apparaître aux patients et publier des créneaux : fiche active, vérifiée,
 * et une inscription complète encore valable à cette date. Toute autre fiche est refusée,
 * y compris une fiche sans statut (refus par défaut).
 */
export function praticienVerifie(p: Practitioner, maintenant: Date): boolean {
  if (p.active !== true || statutVerification(p) !== 'verifie') return false;
  const jour = maintenant.toISOString().slice(0, 10);
  return (p.qualification ?? []).some(
    (q) => inscriptionComplete(q) && (q.period?.end ?? '').slice(0, 10) >= jour,
  );
}

export function verifierPraticien(p: Practitioner): Violation[] {
  const v: Violation[] = [];
  const statut = statutVerification(p);
  if (!statut) {
    v.push({
      regle: 'mbolo-praticien.statutVerification',
      message: 'Le statut de la vérification du professionnel est obligatoire (ADR-0026).',
    });
  }
  if (p.active === true && statut !== 'verifie') {
    v.push({
      regle: 'mbolo-prat-1',
      message: "Un professionnel n'est actif qu'une fois vérifié par une personne habilitée.",
    });
  }
  if (statut === 'verifie' && !(p.qualification ?? []).some(inscriptionComplete)) {
    v.push({
      regle: 'mbolo-prat-2',
      message: "Vérifié : numéro d'inscription, Ordre émetteur et fin de validité obligatoires.",
    });
  }
  return v;
}
