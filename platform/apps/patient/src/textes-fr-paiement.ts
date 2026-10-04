// Textes de l'écran « Payer la consultation » (ADR-0017, ADR-0025). Catalogue à part, chargé avec
// l'écran. Les messages d'erreur des services sont déjà des phrases simples : ils s'affichent tels
// quels (ils passeront à la langue du patient avec les services).
import type { Catalogue } from '@mbolo/client-web';

export const frPaiement = {
  'paiement.titre': 'Payer la consultation',
  'paiement.chargement': 'Chargement…',
  'paiement.indisponible': 'Service indisponible. Réessayez plus tard.',
  'paiement.recu': 'Paiement reçu. Votre rendez-vous est confirmé.',
  'paiement.delaiDepasse': 'Le délai de paiement est dépassé. Le créneau est libéré.',
  'paiement.echoue': 'Le paiement n’a pas abouti. Vous pouvez réessayer.',
  'paiement.mesRendezVous': 'Mes rendez-vous',
  'paiement.delai': {
    one: '— à payer dans {nombre} minute, sinon le créneau est libéré.',
    other: '— à payer dans les {nombre} minutes, sinon le créneau est libéré.',
  },
  'paiement.validez': 'Validez le paiement sur le téléphone avec votre code secret {operateur}.',
  'paiement.operateur': 'Opérateur',
  'paiement.numero': 'Numéro qui paie (le vôtre ou celui d’un proche)',
  'paiement.payer': 'Payer',
  'paiement.plusTard': 'Plus tard',
} as const satisfies Catalogue;
