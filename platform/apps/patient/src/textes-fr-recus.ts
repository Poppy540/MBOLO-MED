// Textes de l'écran « Mes reçus » (ADR-0025). Catalogue à part, chargé avec l'écran : il ne pèse
// rien à l'ouverture de l'application.
import type { Catalogue } from '@mbolo/client-web';

export const frRecus = {
  'recus.titre': 'Mes reçus',
  'recus.chargement': 'Chargement…',
  'recus.indisponible': 'Service indisponible. Réessayez plus tard.',
  'recus.sansConnexion': '{erreur} Vos reçus s’affichent seulement avec une connexion.',
  'recus.aucun': 'Aucun reçu pour le moment. Vous en recevez un à chaque paiement.',
  'recus.liste': 'Reçus',
  'recus.remboursement': 'Remboursement',
  'recus.paiementRecu': 'Paiement reçu',
  'recus.le': 'Le {date}',
  'recus.numero': 'N° {numero}',
  'recus.annule': 'annule le reçu n° {numero}',
  'recus.sansValeurFiscale': 'Reçu sans valeur fiscale.',
  'recus.retour': 'Retour',
} as const satisfies Catalogue;
