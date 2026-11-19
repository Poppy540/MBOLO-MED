// Marque « compte coupé » (plan d'incident, écart E5 de l'exercice sur table n°1) : le responsable
// sécurité a coupé le compte d'un professionnel (compte volé). La fiche reste « vérifiée » (aucune
// nouvelle vérification complète), mais tant que la marque est active le professionnel est retiré
// de l'annuaire, ne reçoit plus de réservation, et ses rendez-vous à venir sont à reprendre par
// l'équipe d'assistance. Aucun texte libre : le motif reste dans le journal d'incident.
import type { Flag } from 'fhir/r4.js';
import { MARQUEUR_FICTIF, SYSTEMES } from './constantes.js';
import type { Environnement, Violation } from './regles.js';

export const CODE_COMPTE_COUPE = 'compte-coupe';

export interface OptionsCompteCoupe {
  practitionerId: string;
  date: string;
  env: Environnement;
}

export function marqueCompteCoupe(o: OptionsCompteCoupe): Flag {
  return {
    resourceType: 'Flag',
    ...(o.env === 'prod' ? {} : { meta: { tag: [MARQUEUR_FICTIF] } }),
    status: 'active',
    category: [{ coding: [{ system: SYSTEMES.categorieFlag, code: 'admin' }] }],
    code: {
      coding: [
        {
          system: SYSTEMES.marqueSecurite,
          code: CODE_COMPTE_COUPE,
          display: 'Compte coupé par le responsable sécurité',
        },
      ],
    },
    subject: { reference: `Practitioner/${o.practitionerId}` },
    period: { start: o.date },
  };
}

/** Levée de la marque au rétablissement du compte : jamais supprimée, passée inactive et datée. */
export function leverCompteCoupe(f: Flag, date: string): Flag {
  return { ...f, status: 'inactive', period: { ...f.period, end: date } };
}

export const estCompteCoupe = (f: Flag): boolean =>
  f.status === 'active' &&
  (f.code.coding ?? []).some(
    (c) => c.system === SYSTEMES.marqueSecurite && c.code === CODE_COMPTE_COUPE,
  );

/**
 * mbolo-flag-1 : seule la marque « compte coupé » existe, sur la fiche d'un professionnel, sans
 * texte libre (le dossier d'un patient ne porte jamais de marque de sécurité).
 */
export function verifierMarque(f: Flag): Violation[] {
  const codes = f.code.coding ?? [];
  const valide =
    codes.length === 1 &&
    codes[0]?.system === SYSTEMES.marqueSecurite &&
    codes[0].code === CODE_COMPTE_COUPE &&
    f.code.text === undefined &&
    /^Practitioner\/[A-Za-z0-9\-.]{1,64}$/.test(f.subject.reference ?? '') &&
    Boolean(f.period?.start);
  return valide
    ? []
    : [
        {
          regle: 'mbolo-flag-1',
          message:
            'Seule la marque « compte coupé » est permise, sur la fiche d’un professionnel, datée et sans texte libre.',
        },
      ];
}
