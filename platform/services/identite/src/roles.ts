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
  /**
   * Équipe d'assistance aux patients (ADR-0019) : retire les proches d'un patient à sa demande, après
   * l'avoir rappelé au numéro de son dossier. Aucun accès clinique, ni au dossier ni aux documents.
   * Double authentification. Jamais un agent IA.
   */
  'assistance-patient',
  /**
   * Relit les relevés mensuels des professionnels et, plus tard, valide leurs reversements
   * (ADR-0020) ; aucun accès clinique. Double authentification. Jamais un agent IA, jamais pour
   * lui-même.
   */
  'validation-reversement',
  /**
   * Équipe de recrutement (ADR-0026) : invite les professionnels de santé par un code à usage unique ;
   * ne vérifie jamais un candidat qu'elle a recruté. Aucun accès clinique. Double authentification.
   * Jamais un agent IA.
   */
  'recrutement',
  /**
   * Vérification des professionnels de santé (ADR-0026) : examine le dossier d'un candidat, consulte
   * les sources officielles et décide ; jamais pour un candidat qu'elle a recruté (contrôlé par le
   * service documents). Aucun accès clinique. Double authentification. Jamais un agent IA.
   */
  'verification-professionnels',
  /**
   * Professionnel qui a créé son compte avec un code d'invitation, en attente de vérification
   * (ADR-0026) : il complète son dossier de candidature, sans aucun accès aux patients.
   */
  'professionnel-candidat',
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
  /**
   * Niveau d'authentification (`acr` du jeton, ADR-0022) : 2 après un code SMS de moins de
   * 15 minutes. Absent : niveau 1 (mot de passe seul, ou compte de service).
   */
  niveau?: number;
  /** Pour un agent IA : nom de l'agent et patient de la session en cours (et lui seul). */
  agent?: { nom: string; patientSession: string };
}

export const estRole = (r: string): r is Role => (ROLES as readonly string[]).includes(r);
