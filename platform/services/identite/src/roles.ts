// Rôles de Mbolo Santé (miroir des rôles de royaume Keycloak, keycloak/realm-mbolo.json).

export const ROLES = [
  'patient',
  'proche',
  'professionnel',
  'infirmier',
  'pharmacien',
  'administrateur',
  'agent-ia',
  /** Relecteur des accès d'urgence : revoit les bris de glace, aucun accès clinique. */
  'revue-acces',
  /** Crée et révoque les codes d'invitation (ADR-0013), aucun accès clinique. Jamais un agent IA. */
  'gestion-invitations',
  /**
   * Vérifie l'identité des patients à distance (ADR-0015) : voit leurs photos (chaque ouverture est
   * tracée) et décide ; aucun accès clinique. Double authentification. Jamais un agent IA.
   */
  'verification-identite',
  /**
   * Valide ou refuse les remboursements préparés par la plateforme (ADR-0017) ; aucun accès
   * clinique. Double authentification. Jamais un agent IA, jamais pour son propre paiement.
   */
  'validation-remboursement',
] as const;
export type Role = (typeof ROLES)[number];

/**
 * Utilisateur authentifié, tel que reconstruit à partir d'un jeton vérifié.
 * Les identifiants FHIR (patientId, practitionerId, relatedPersonId) proviennent d'attributs
 * Keycloak posés par un humain habilité, jamais d'une saisie de l'utilisateur.
 */
export interface Utilisateur {
  sujet: string;
  roles: readonly Role[];
  patientId?: string;
  practitionerId?: string;
  relatedPersonId?: string;
  /** Pour un agent IA : nom de l'agent et patient de la session en cours (et lui seul). */
  agent?: { nom: string; patientSession: string };
}

export const estRole = (r: string): r is Role => (ROLES as readonly string[]).includes(r);
