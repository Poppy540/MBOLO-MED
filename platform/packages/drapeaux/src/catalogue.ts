// Catalogue des feature flags de Mbolo Santé (ADR-0003, docs/deploiement/flags.md).
// Règles : désactivé par défaut ; évaluation côté serveur ; activation en production réservée à un
// humain habilité ; un flag ne s'active que si ceux dont il dépend sont actifs.
// La sécurité (authentification, consentement, contrôle d'accès, orientation vers les urgences)
// n'est JAMAIS derrière un flag : seules des fonctions nouvelles le sont.

export interface DefinitionDrapeau {
  description: string;
  /** Vague prévue pour l'activation (docs/deploiement/vagues.md). */
  vague: 1 | 2 | 3 | 4;
  /** Flags qui doivent être actifs pour que celui-ci le soit (noms du catalogue, vérifiés par test). */
  dependances: readonly string[];
  /** Branché dans le code (sinon : déclaré pour préparer la vague). */
  branche: boolean;
}

export const CATALOGUE = {
  'consentement.proche': {
    description:
      'Un patient peut donner accès à son dossier à un proche (diaspora, abonnement Famille) par un consentement C-PROCHE.',
    vague: 2,
    dependances: [],
    branche: true,
  },
  'teleconsultation.video': {
    description: 'Téléconsultation de médecine générale en vidéo, avec repli audio.',
    vague: 1,
    dependances: [],
    branche: false,
  },
  'paiement.mobile-money': {
    description: 'Paiement des consultations par mobile money (Airtel Money, Moov Money).',
    vague: 1,
    dependances: [],
    branche: false,
  },
  'agent01.accueil': {
    description: 'Agent 1 : accueil, recueil des symptômes et orientation (jamais de diagnostic).',
    vague: 1,
    dependances: ['teleconsultation.video'],
    branche: false,
  },
} as const satisfies Record<string, DefinitionDrapeau>;

export type NomDrapeau = keyof typeof CATALOGUE;

export const NOMS_DRAPEAUX = Object.keys(CATALOGUE) as NomDrapeau[];

/** Contexte d'évaluation (ADR-0007) : aucun identifiant de santé, jamais de donnée médicale. */
export interface ContexteDrapeau {
  /** Identifiant technique du compte (sujet Keycloak), pour le ciblage d'une cohorte. */
  sujet?: string;
  typeUtilisateur?: string;
  ville?: string;
  specialite?: string;
  vague?: string;
}
