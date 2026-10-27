// Professionnel de santé et statut de sa vérification (ADR-0026, proposée).
// La fiche est créée inactive (« a-verifier ») ; seule la décision « verifie » d'une personne
// habilitée (rôle verification-professionnels, jamais un agent IA) permet au serveur de l'activer.
// Annuaire et créneaux sont réservés aux professionnels vérifiés dont l'inscription est en cours
// de validité (praticienVerifie).
import type { Practitioner, PractitionerQualification } from 'fhir/r4.js';
import { meta } from './construire.js';
import { CANONIQUE, PROFILS, SYSTEMES } from './constantes.js';
import { SYSTEME_LANGUE, codeLangueValide } from './langue.js';
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

/**
 * Spécialités admises (liste provisoire, à valider par le comité médical) ; chaque pays en ouvre
 * une partie par configuration. Le candidat choisit dans la liste, jamais en texte libre.
 */
export const SPECIALITES = {
  'medecine-generale': 'Médecine générale',
  pediatrie: 'Pédiatrie',
  'gynecologie-obstetrique': 'Gynécologie-obstétrique',
  'medecine-interne': 'Médecine interne',
  cardiologie: 'Cardiologie',
  dermatologie: 'Dermatologie',
  psychiatrie: 'Psychiatrie',
  'endocrinologie-diabetologie': 'Endocrinologie-diabétologie',
  'maladies-infectieuses': 'Maladies infectieuses et tropicales',
} as const;
export type Specialite = keyof typeof SPECIALITES;
export const estSpecialite = (code: string): code is Specialite =>
  Object.prototype.hasOwnProperty.call(SPECIALITES, code);

/**
 * Déclaration du candidat (ADR-0026, étape 3b) : spécialité, Ordre d'inscription (pays) et numéro,
 * langues de consultation. Elle n'est qu'une déclaration : elle reste sans période de validité,
 * donc ne peut jamais rendre un professionnel « vérifié » (mbolo-prat-2) ; la personne habilitée
 * la contrôle à la source et le serveur écrit alors l'inscription vérifiée.
 */
export interface Declaration {
  specialite: Specialite;
  /** Pays de l'Ordre, ISO 3166-1 alpha-2 (ex. « GA »). */
  paysOrdre: string;
  numeroOrdre: string;
  /** Codes BCP 47 (ex. « fr », « fan »). */
  langues: string[];
}

const PAYS = /^[A-Z]{2}$/;
const NUMERO_ORDRE = /^[A-Za-z0-9][A-Za-z0-9 ./-]{0,31}$/;
export const LANGUES_CONSULTATION_MAX = 6;

/** Éléments de la fiche écrits par la déclaration : `qualification` et `communication` seulement. */
export function declarationPraticien(
  d: Declaration,
): Required<Pick<Practitioner, 'qualification' | 'communication'>> {
  if (!estSpecialite(d.specialite)) throw new Error('Spécialité inconnue.');
  if (!PAYS.test(d.paysOrdre)) throw new Error('Pays de l’Ordre invalide.');
  if (!NUMERO_ORDRE.test(d.numeroOrdre)) throw new Error('Numéro d’inscription invalide.');
  const langues = [...new Set(d.langues)];
  if (
    langues.length === 0 ||
    langues.length > LANGUES_CONSULTATION_MAX ||
    !langues.every(codeLangueValide)
  ) {
    throw new Error('Langues de consultation invalides.');
  }
  return {
    qualification: [
      {
        code: {
          coding: [
            { system: SYSTEMES.specialite, code: d.specialite, display: SPECIALITES[d.specialite] },
          ],
          text: SPECIALITES[d.specialite],
        },
        identifier: [{ value: d.numeroOrdre }],
        issuer: {
          identifier: { system: SYSTEMES.pays, value: d.paysOrdre },
          display: `Ordre (${d.paysOrdre})`,
        },
        // Jamais de période : une déclaration n'est pas une inscription vérifiée.
      },
    ],
    communication: langues.map((code) => ({ coding: [{ system: SYSTEME_LANGUE, code }] })),
  };
}

/** Relit la déclaration d'une fiche ; undefined si elle n'a rien de déclaré ou de lisible. */
export function declarationDe(
  p: Pick<Practitioner, 'qualification' | 'communication'>,
): Declaration | undefined {
  const q = p.qualification?.[0];
  const specialite = q?.code.coding?.find((c) => c.system === SYSTEMES.specialite)?.code ?? '';
  const paysOrdre =
    q?.issuer?.identifier?.system === SYSTEMES.pays ? (q.issuer.identifier.value ?? '') : '';
  const numeroOrdre = q?.identifier?.[0]?.value ?? '';
  const langues = (p.communication ?? []).flatMap((c) =>
    (c.coding ?? []).filter((x) => x.system === SYSTEME_LANGUE && x.code).map((x) => x.code ?? ''),
  );
  if (!estSpecialite(specialite) || !paysOrdre || !numeroOrdre) return undefined;
  return { specialite, paysOrdre, numeroOrdre, langues };
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
