// Langue préférée du patient (ADR-0025), dans Patient.communication : choisie par le patient dans
// l'application, lue par le service des notifications pour écrire ses SMS dans sa langue. Ce n'est
// pas une donnée de santé, mais elle ne sort du dossier que pour les services qui en ont besoin.
import type { Patient } from 'fhir/r4.js';

export const SYSTEME_LANGUE = 'urn:ietf:bcp:47';

/**
 * Code BCP 47 simple : langue en 2 ou 3 lettres, puis au plus 4 sous-étiquettes de 1 à 8 caractères
 * (« fr », « fr-GA », « fr-x-fictif »). Vérifié morceau par morceau, sans répétition imbriquée.
 */
export function codeLangueValide(code: string): boolean {
  if (code.length > 35) return false;
  const [langue, ...suite] = code.split('-');
  return (
    /^[a-z]{2,3}$/.test(langue ?? '') &&
    suite.length <= 4 &&
    suite.every((s) => /^[A-Za-z0-9]{1,8}$/.test(s))
  );
}

/** Patient.communication pour une seule langue, préférée. */
export function communicationPreferee(code: string): NonNullable<Patient['communication']> {
  if (!codeLangueValide(code)) throw new Error('Code de langue invalide.');
  return [{ language: { coding: [{ system: SYSTEME_LANGUE, code }] }, preferred: true }];
}

/** Langue marquée préférée, sinon la première ; undefined si aucune n'est indiquée ou valable. */
export function languePreferee(p: Pick<Patient, 'communication'>): string | undefined {
  const langues = p.communication ?? [];
  const choisie = langues.find((c) => c.preferred) ?? langues[0];
  const code = choisie?.language.coding?.find((c) => c.system === SYSTEME_LANGUE)?.code;
  return code && codeLangueValide(code) ? code : undefined;
}
