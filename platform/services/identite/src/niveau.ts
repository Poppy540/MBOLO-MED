// Double authentification des patients (ADR-0022) : niveau d'authentification exigé par les
// actions sensibles (payer, partager son dossier avec un médecin, inviter un proche).
import type { Utilisateur } from './roles.js';

/** Niveau 2 : mot de passe et code reçu par SMS depuis moins de 15 minutes (royaume Keycloak). */
export const NIVEAU_ACTIONS_SENSIBLES = 2;

/** Motif rendu aux applications, qui redemandent alors le niveau 2 puis reprennent l'action. */
export const MOTIF_NIVEAU_INSUFFISANT = 'niveau-insuffisant';

export class ErreurNiveauInsuffisant extends Error {
  readonly motif = MOTIF_NIVEAU_INSUFFISANT;
  constructor(readonly niveauExige: number = NIVEAU_ACTIONS_SENSIBLES) {
    super('Confirmation par code SMS requise.');
    this.name = 'ErreurNiveauInsuffisant';
  }
}

/** Niveau d'un utilisateur : `acr` du jeton, 1 s'il est absent. */
export const niveauDe = (u: Utilisateur): number => u.niveau ?? 1;

/** Refuse l'action tant que le jeton n'atteint pas le niveau exigé. */
export function exigerNiveau(u: Utilisateur, niveau: number = NIVEAU_ACTIONS_SENSIBLES): void {
  if (niveauDe(u) < niveau) throw new ErreurNiveauInsuffisant(niveau);
}

/**
 * Réponse HTTP d'un refus pour niveau insuffisant : 401 avec l'en-tête de l'authentification
 * renforcée (RFC 9470), que l'application lit pour redemander le code.
 */
export const reponseNiveauInsuffisant = (e: ErreurNiveauInsuffisant) => ({
  statut: 401 as const,
  entetes: {
    'www-authenticate': `Bearer error="insufficient_user_authentication", acr_values="${e.niveauExige}"`,
  },
  corps: { erreur: 'Confirmation par code SMS requise.', motif: e.motif },
});
