// Numéro du dossier du patient (ADR-0023). Un numéro changé porte le parcours du changement
// (extension `changement-telephone`) et sa date (`period.start`). Après une perte, aucun code de
// connexion n'est envoyé pendant 24 heures : le vrai patient a le temps de réagir à l'alerte reçue
// à l'ancien numéro.
import type { ContactPoint } from 'fhir/r4.js';
import {
  EXTENSION_CHANGEMENT_TELEPHONE,
  PARCOURS_CHANGEMENT_TELEPHONE,
  type ParcoursChangementTelephone,
} from './constantes.js';
import type { Violation } from './regles.js';

/** Attente après un changement pour perte, avant tout nouveau code de connexion. */
export const ATTENTE_APRES_PERTE_MS = 24 * 3_600_000;

/** Nouveau numéro mobile du dossier, avec le parcours et la date du changement. */
export function telephoneChange(
  numero: string,
  parcours: ParcoursChangementTelephone,
  le: Date,
): ContactPoint {
  return {
    extension: [{ url: EXTENSION_CHANGEMENT_TELEPHONE, valueCode: parcours }],
    system: 'phone',
    value: numero,
    use: 'mobile',
    period: { start: le.toISOString() },
  };
}

/** Parcours et date du dernier changement de ce numéro, s'il a été changé. */
export function changementTelephone(
  t: ContactPoint,
): { parcours: ParcoursChangementTelephone; le: Date } | undefined {
  const code = t.extension?.find((e) => e.url === EXTENSION_CHANGEMENT_TELEPHONE)?.valueCode;
  const le = t.period?.start ? new Date(t.period.start) : undefined;
  if (!le || Number.isNaN(le.getTime())) return undefined;
  return code === 'patient' || code === 'perte' ? { parcours: code, le } : undefined;
}

/** Vrai pendant les 24 heures qui suivent un changement pour perte de ce numéro. */
export function enAttenteApresPerte(
  t: ContactPoint,
  maintenant: Date,
  attenteMs = ATTENTE_APRES_PERTE_MS,
): boolean {
  const c = changementTelephone(t);
  return c?.parcours === 'perte' && maintenant.getTime() - c.le.getTime() < attenteMs;
}

/** Règle mbolo-pat-3 et parcours connu, pour chaque numéro du dossier. */
export function verifierTelephones(telecom: ContactPoint[] | undefined): Violation[] {
  const v: Violation[] = [];
  for (const t of telecom ?? []) {
    const changements = (t.extension ?? []).filter((e) => e.url === EXTENSION_CHANGEMENT_TELEPHONE);
    if (changements.length === 0) continue;
    if (
      changements.length > 1 ||
      !(PARCOURS_CHANGEMENT_TELEPHONE as readonly string[]).includes(
        changements[0]?.valueCode ?? '',
      )
    ) {
      v.push({
        regle: 'mbolo-patient.changementTelephone',
        message: 'Un et un seul parcours de changement de numéro connu.',
      });
    }
    if (!t.period?.start) {
      v.push({ regle: 'mbolo-pat-3', message: 'Un numéro changé porte la date du changement.' });
    }
  }
  return v;
}
