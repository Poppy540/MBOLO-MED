export * from './constantes.js';
export {
  agendaVideo,
  annulerRendezVous,
  confirmerRendezVous,
  changerStatutIdentite,
  compteRendu,
  conditionDeclaree,
  consentement,
  creneauVideo,
  evenementAccesDossier,
  patientInscrit,
  provenanceAgent,
  rendezVousVideo,
  reporterRendezVous,
  revoquer,
  revueBrisDeGlace,
  statutIdentite,
  texteSection,
} from './construire.js';
export type {
  OptionsCompteRendu,
  OptionsConditionDeclaree,
  OptionsConsentement,
  OptionsCreneau,
  OptionsEvenementAcces,
  OptionsPatientInscrit,
  OptionsRevueBrisDeGlace,
  OptionsProvenanceAgent,
  OptionsRendezVous,
} from './construire.js';
export { jeuFictif } from './donnees-fictives.js';
export {
  valider,
  verifierAppointment,
  verifierComposition,
  verifierCondition,
  verifierConsent,
  verifierMarqueurFictif,
  verifierPatient,
  verifierProvenance,
  verifierSchedule,
  verifierSlot,
} from './regles.js';
export type { Environnement, Violation } from './regles.js';
export {
  RENOUVELLEMENTS_MAX,
  SYSTEME_ORDONNANCE,
  UCUM,
  ordonnance,
  verifierOrdonnance,
} from './ordonnance.js';
export type { Code, LigneOrdonnance, OptionsOrdonnance } from './ordonnance.js';
export { LIENS_PROCHE, PRENOM_MAX, SYSTEME_LIEN, procheInvite, verifierProche } from './proche.js';
export type { LienProche, OptionsProche } from './proche.js';
export {
  ATTENTE_APRES_PERTE_MS,
  changementTelephone,
  enAttenteApresPerte,
  telephoneChange,
  verifierTelephones,
} from './telephone.js';
export {
  SYSTEME_LANGUE,
  codeLangueValide,
  communicationPreferee,
  languePreferee,
} from './langue.js';
export {
  EXTENSION_STATUT_VERIFICATION,
  LANGUES_CONSULTATION_MAX,
  SPECIALITES,
  STATUTS_VERIFICATION_PRO,
  declarationDe,
  declarationPraticien,
  estSpecialite,
  praticien,
  praticienVerifie,
  statutVerification,
  verifierPraticien,
} from './praticien.js';
export type {
  Declaration,
  Inscription,
  OptionsPraticien,
  Specialite,
  StatutVerificationPro,
} from './praticien.js';
