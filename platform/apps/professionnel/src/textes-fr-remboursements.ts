// Textes de l'écran « Remboursements à valider » (ADR-0017, ADR-0025). Catalogue chargé avec l'écran.
import type { Catalogue } from '@mbolo/client-web';

export const frRemboursements = {
  'remb.titre': 'Remboursements à valider',
  'remb.explication':
    'Paiements reçus pour des rendez-vous annulés. Décidez selon les règles de remboursement de Mbolo Santé ; l’argent revient au téléphone qui a payé.',
  'remb.chargement': 'Chargement…',
  'remb.indisponible': 'Service indisponible. Réessayez plus tard.',
  'remb.aucun': 'Aucun remboursement à valider.',
  'remb.prepareLe': 'Préparé le {date}',
  'remb.confirmerRemboursement': 'Confirmer le remboursement',
  'remb.confirmerRefus': 'Confirmer le refus',
  'remb.annuler': 'Annuler',
  'remb.valider': 'Valider',
  'remb.refuser': 'Refuser',
  'remb.verse': 'Remboursement versé.',
  'remb.valide': 'Remboursement validé ; il sera versé dès que le prestataire répondra.',
  'remb.refuse': 'Remboursement refusé.',
} as const satisfies Catalogue;
