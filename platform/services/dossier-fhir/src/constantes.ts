// Adresses canoniques et codes du guide d'implémentation Mbolo Santé (ig/).
// Domaine .example provisoire, à remplacer par le domaine définitif (même valeur que ig/sushi-config.yaml).

export const CANONIQUE = 'https://mbolo-sante.example/fhir';

export const PROFILS = {
  patient: `${CANONIQUE}/StructureDefinition/mbolo-patient`,
  consent: `${CANONIQUE}/StructureDefinition/mbolo-consent`,
  condition: `${CANONIQUE}/StructureDefinition/mbolo-condition`,
  provenance: `${CANONIQUE}/StructureDefinition/mbolo-provenance`,
  rendezVous: `${CANONIQUE}/StructureDefinition/mbolo-rendez-vous`,
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
} as const;

export const EXTENSION_MODE_RECUEIL = `${CANONIQUE}/StructureDefinition/mode-recueil`;

export const CATEGORIES_CONSENTEMENT = [
  'C-SOINS',
  'C-PARTAGE-PRO',
  'C-PROCHE',
  'C-RAPPELS',
  'C-OBSERVATION',
  'C-PHOTOS',
] as const;
export type CategorieConsentement = (typeof CATEGORIES_CONSENTEMENT)[number];

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
