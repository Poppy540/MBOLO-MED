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
  /**
   * Essais de code d'invitation ou de date de naissance bloqués par la limite (revue ASVS n°1, D3) :
   * en rafale, signe d'une recherche de codes ou d'une usurpation auprès de l'assistance.
   */
  'essais-bloques',
  /**
   * Code de récupération du compte remis par l'équipe d'assistance (ADR-0021) : en série pour un
   * même membre de l'équipe, signe d'un abus de ce rôle.
   */
  'code-recuperation',
  /**
   * Code de double authentification envoyé par SMS à un patient (ADR-0022) : en rafale sur la
   * plateforme, signe d'un pompage de SMS (coût) ou d'une attaque.
   */
  'code-connexion',
  /**
   * Codes de double authentification refusés pour un dossier : plus de 10 dans l'heure (ADR-0022).
   * Quelqu'un connaît le mot de passe du patient, ou cherche à inonder son téléphone.
   */
  'code-connexion-bloque',
  /**
   * Numéro du dossier d'un patient changé (ADR-0023) : en série sur la plateforme, signe d'une prise
   * de comptes (mots de passe et téléphones volés).
   */
  'numero-change',
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
