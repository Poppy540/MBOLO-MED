// Adresses canoniques et codes du guide d'implémentation Mbolo Santé (ig/).
// Domaine .example provisoire, à remplacer par le domaine définitif (même valeur que ig/sushi-config.yaml).

export const CANONIQUE = 'https://mbolo-sante.example/fhir';

export const PROFILS = {
  patient: `${CANONIQUE}/StructureDefinition/mbolo-patient`,
  consent: `${CANONIQUE}/StructureDefinition/mbolo-consent`,
  condition: `${CANONIQUE}/StructureDefinition/mbolo-condition`,
  provenance: `${CANONIQUE}/StructureDefinition/mbolo-provenance`,
  rendezVous: `${CANONIQUE}/StructureDefinition/mbolo-rendez-vous`,
  agenda: `${CANONIQUE}/StructureDefinition/mbolo-agenda`,
  creneau: `${CANONIQUE}/StructureDefinition/mbolo-creneau`,
  compteRendu: `${CANONIQUE}/StructureDefinition/mbolo-compte-rendu`,
  /** Ligne d'ordonnance électronique (ADR-0018, proposée). */
  ordonnance: `${CANONIQUE}/StructureDefinition/mbolo-ordonnance`,
  proche: `${CANONIQUE}/StructureDefinition/mbolo-proche`,
  /** Professionnel de santé et statut de sa vérification (ADR-0026, proposée). */
  praticien: `${CANONIQUE}/StructureDefinition/mbolo-praticien`,
} as const;

export const SYSTEMES = {
  consentement: `${CANONIQUE}/CodeSystem/mbolo-consentement`,
  modeRecueil: `${CANONIQUE}/CodeSystem/mbolo-mode-recueil`,
  marqueur: `${CANONIQUE}/CodeSystem/mbolo-marqueur`,
  identifiantPatient: `${CANONIQUE}/identifiant-patient`,
  conditionVerification: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  conditionClinique: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  conditionCategorie: 'http://terminology.hl7.org/CodeSystem/condition-category',
  consentScope: 'http://terminology.hl7.org/CodeSystem/consentscope',
  actReason: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
  provenanceType: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
  participationType: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
  auditType: 'http://dicom.nema.org/resources/ontology/DCM',
  auditEntiteType: 'http://terminology.hl7.org/CodeSystem/audit-entity-type',
  sujetCompte: `${CANONIQUE}/identifiant-compte`,
  motifDecision: `${CANONIQUE}/CodeSystem/mbolo-motif-acces`,
  role: `${CANONIQUE}/CodeSystem/mbolo-role`,
  sousTypeAudit: `${CANONIQUE}/CodeSystem/mbolo-audit`,
  modeConsultation: `${CANONIQUE}/CodeSystem/mbolo-mode-consultation`,
  annulation: `${CANONIQUE}/CodeSystem/mbolo-annulation`,
  typeDocument: `${CANONIQUE}/CodeSystem/mbolo-type-document`,
  sectionCompteRendu: `${CANONIQUE}/CodeSystem/mbolo-section-compte-rendu`,
  typeIdentifiantPatient: `${CANONIQUE}/CodeSystem/mbolo-type-identifiant-patient`,
  statutIdentite: `${CANONIQUE}/CodeSystem/mbolo-statut-identite`,
  changementTelephone: `${CANONIQUE}/CodeSystem/mbolo-changement-telephone`,
  statutVerificationPro: `${CANONIQUE}/CodeSystem/mbolo-statut-verification`,
  specialite: `${CANONIQUE}/CodeSystem/mbolo-specialite`,
  pays: 'urn:iso:std:iso:3166',
} as const;

export const EXTENSION_MODE_RECUEIL = `${CANONIQUE}/StructureDefinition/mode-recueil`;
export const EXTENSION_DATE_ANNULATION = `${CANONIQUE}/StructureDefinition/date-annulation`;
export const EXTENSION_STATUT_IDENTITE = `${CANONIQUE}/StructureDefinition/statut-identite`;
export const EXTENSION_CHANGEMENT_TELEPHONE = `${CANONIQUE}/StructureDefinition/changement-telephone`;

/**
 * Types d'identifiant du patient (ADR-0014). Le système (URI) de chaque identifiant dépend du pays
 * et vient de la configuration du déploiement (Gabon : CNAMGS pour l'assurance maladie).
 */
export const TYPES_IDENTIFIANT_PATIENT = ['assurance-maladie', 'provisoire'] as const;
export type TypeIdentifiantPatient = (typeof TYPES_IDENTIFIANT_PATIENT)[number];

/** Vérification d'identité par un humain habilité ; aucune consultation avant « verifiee ». */
export const STATUTS_IDENTITE = ['a-verifier', 'verifiee', 'refusee'] as const;
export type StatutIdentite = (typeof STATUTS_IDENTITE)[number];

/**
 * Comment le numéro du dossier a été changé (ADR-0023) : par le patient avec les deux numéros, ou
 * après une perte, sur décision d'une personne habilitée (24 heures sans code de connexion).
 */
export const PARCOURS_CHANGEMENT_TELEPHONE = ['patient', 'perte'] as const;
export type ParcoursChangementTelephone = (typeof PARCOURS_CHANGEMENT_TELEPHONE)[number];

/**
 * Qui a annulé un rendez-vous (code, jamais de motif en texte libre). « plateforme » : paiement non
 * confirmé dans le délai de réservation (ADR-0017), jamais une décision médicale.
 */
export const AUTEURS_ANNULATION = ['patient', 'professionnel', 'plateforme'] as const;
export type AuteurAnnulation = (typeof AUTEURS_ANNULATION)[number];

export const CATEGORIES_CONSENTEMENT = [
  'C-SOINS',
  'C-PARTAGE-PRO',
  'C-PROCHE',
  'C-RAPPELS',
  'C-OBSERVATION',
  'C-PHOTOS',
  'C-IDENTITE',
] as const;
export type CategorieConsentement = (typeof CATEGORIES_CONSENTEMENT)[number];

/**
 * Catégories qu'un patient accepte lui-même, jamais un agent IA ni un proche à sa place :
 * charte de vérification d'identité (photos du document et du visage, ADR-0015).
 */
export const CATEGORIES_PATIENT_SEUL: readonly CategorieConsentement[] = ['C-IDENTITE'];

/** Conclusions possibles de la revue humaine d'un bris de glace. */
export const CONCLUSIONS_REVUE = ['justifie', 'injustifie', 'a-approfondir'] as const;
export type ConclusionRevue = (typeof CONCLUSIONS_REVUE)[number];

export const MODES_RECUEIL = ['texte', 'vocal', 'pictogramme', 'interprete'] as const;
export type ModeRecueil = (typeof MODES_RECUEIL)[number];

export const MARQUEUR_FICTIF = {
  system: SYSTEMES.marqueur,
  code: 'fictif',
  display: 'Donnée fictive',
};

/** Catégories de partage : le consentement doit désigner son bénéficiaire (provision.actor). */
export const CATEGORIES_AVEC_BENEFICIAIRE: readonly CategorieConsentement[] = [
  'C-PARTAGE-PRO',
  'C-PROCHE',
];

/** Sections du compte-rendu de téléconsultation, dans l'ordre d'affichage. */
export const SECTIONS_COMPTE_RENDU = [
  'motif',
  'observations',
  'conclusion',
  'conduite-a-tenir',
] as const;
export type SectionCompteRendu = (typeof SECTIONS_COMPTE_RENDU)[number];
