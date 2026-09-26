export * from './constantes.js';
export { conditionDeclaree, consentement, provenanceAgent, revoquer } from './construire.js';
export type {
  OptionsConditionDeclaree,
  OptionsConsentement,
  OptionsProvenanceAgent,
} from './construire.js';
export { jeuFictif } from './donnees-fictives.js';
export {
  valider,
  verifierCondition,
  verifierConsent,
  verifierMarqueurFictif,
  verifierProvenance,
} from './regles.js';
export type { Environnement, Violation } from './regles.js';
