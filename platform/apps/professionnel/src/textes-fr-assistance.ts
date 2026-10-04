// Textes de l'écran « Aider un patient qui appelle » (ADR-0019, ADR-0021, ADR-0025). Catalogue chargé
// avec l'écran. Les étapes (rappel au numéro du dossier, date de naissance dite par le patient) sont
// une procédure de sécurité : une traduction doit garder leur ordre et leur sens exacts.
import type { Catalogue } from '@mbolo/client-web';

export const frAssistance = {
  'assist.titre': 'Aider un patient qui appelle',
  'assist.explication':
    'Pour un patient qui ne peut pas agir lui-même dans son application : retirer ses proches, ou lui donner un code pour retrouver son compte. Chaque étape est enregistrée dans son dossier.',
  'assist.indisponible': 'Service indisponible. Réessayez plus tard.',
  'assist.typeNumero': 'Type de numéro',
  'assist.assurance': 'Assurance maladie ({assurance})',
  'assist.provisoire': 'Numéro provisoire',
  'assist.numeroDonne': 'Numéro donné par le patient',
  'assist.retrouver': 'Retrouver le dossier',
  'assist.dictez':
    'Dictez ce code au patient (ou à son aidant, patient présent). Il ne sera plus affiché.',
  'assist.validite':
    'Valable une seule fois, jusqu’au {date}. Le patient le saisit dans « Mot de passe oublié ? », puis choisit un nouveau mot de passe.',
  'assist.dicte': 'J’ai dicté le code',
  'assist.sansNumero':
    'Aucun numéro dans ce dossier : impossible de rappeler le patient, donc pas d’intervention de l’équipe.',
  'assist.proches': 'Proches avec un accès ou une invitation en cours :',
  'assist.rappeler': '1. Raccrochez, puis rappelez le patient au numéro de son dossier :',
  'assist.rappele': 'J’ai rappelé le patient à ce numéro et il confirme sa demande',
  'assist.demande': 'Sa demande',
  'assist.retirerProches': 'Retirer tous ses proches',
  'assist.retrouverCompte': 'Retrouver son compte (mot de passe oublié)',
  'assist.naissance': '2. Date de naissance dite par le patient',
  'assist.numeroLu': '3. Numéro lu par le patient sur sa carte',
  'assist.donnerCode': 'Donner un code',
  // Zéro a sa propre phrase : en français, 0 suit la forme « one » des règles de pluriel.
  'assist.aucunRetire': 'Aucun proche à retirer.',
  'assist.retires': { one: '{nombre} proche retiré.', other: '{nombre} proches retirés.' },
  'assist.smsEnvoye': 'Le patient a reçu un SMS de confirmation.',
  'assist.smsEchec': 'Le SMS de confirmation n’a pas pu partir : prévenez le patient.',
} as const satisfies Catalogue;
