// Événements d'alerte nommés (ADR-0016) : un champ `alerte` stable dans le contexte du journal, que
// la supervision compte (Loki, `| json | contexte_alerte="…"`) pour déclencher l'astreinte.
// Jamais de donnée de santé ni de nom : le contexte passe par le masquage comme tout le journal.
import type { Journal } from './journal.js';

export const ALERTES = [
  /** Un vérificateur ouvre une photo d'identité (ADR-0015). */
  'consultation-photo',
  /** Accès d'urgence au dossier, à revoir par un humain. */
  'bris-de-glace',
  /** Accès au dossier refusé (compte humain ou service). */
  'acces-refuse',
  /** Requêtes refusées par une limite d'appels (429). */
  'limite-appels',
  /** Erreur interne d'un service, ou dossier médical indisponible (5xx). */
  'erreur-serveur',
  /** Paiement reçu pour un rendez-vous annulé : remboursement à valider par un humain (ADR-0017). */
  'remboursement-a-valider',
] as const;
export type Alerte = (typeof ALERTES)[number];

/** Écrit un événement d'alerte ; `erreur-serveur` au niveau erreur, les autres en avertissement. */
export function signalerAlerte(
  journal: Journal,
  alerte: Alerte,
  message: string,
  contexte: Record<string, unknown> = {},
): void {
  const ecrire = alerte === 'erreur-serveur' ? journal.erreur : journal.avertissement;
  ecrire(message, { ...contexte, alerte });
}
