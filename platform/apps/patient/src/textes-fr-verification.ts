// Textes de « Vérifier mon identité » (ADR-0014, ADR-0015, ADR-0023, ADR-0025). Catalogue à part,
// chargé avec l'écran. Les clés `charte.*` forment le texte de la charte C-IDENTITE
// (docs/securite/charte-verification-identite.md, BROUILLON) : sa version est enregistrée avec
// l'accord ; toute traduction est validée par le juriste et porte sa propre version.
import type { Catalogue } from '@mbolo/client-web';

export const frVerification = {
  'verification.indisponible': 'Service indisponible. Réessayez plus tard.',
  'verification.imageIllisible': 'Cette image ne peut pas être lue. Prenez une nouvelle photo.',
  'verification.photoTropLourde': 'Photo trop lourde. Prenez une nouvelle photo.',
  'verification.aucunePerte': 'Aucune demande de changement de numéro en cours.',
  'verification.choisirPhoto': 'Choisissez ou prenez d’abord une photo.',
  'verification.charteRefusee': 'Charte refusée',
  'verification.refusExplication':
    'Vous avez refusé la charte. Vous gardez votre compte, mais vous ne pourrez pas consulter. Un professionnel de santé peut vous proposer une vérification en personne.',
  'verification.chargement': 'Chargement…',
  'verification.retour': 'Retour',
  'verification.deuxPhotos': 'Vos deux photos',
  'verification.deuxNouvellesPhotos': 'Vos deux nouvelles photos',
  'verification.perteExplication':
    "Pour changer votre numéro sans votre ancien téléphone, une personne de l'équipe Mbolo Santé doit vérifier que c'est bien vous.",
  'verification.photosEnvoyees': 'Photos envoyées',
  'verification.document': 'Votre document',
  'verification.documentEnvoye': 'Votre document est envoyé',
  'verification.visage': 'Votre visage',
  'verification.visageEnvoye': 'Votre visage est envoyé',
  'verification.merciPerte':
    'Merci. Une personne de l’équipe Mbolo Santé va vérifier vos photos avant de changer votre numéro. Votre ancien numéro recevra un message.',
  'verification.merci':
    "Merci. Une personne de l'équipe Mbolo Santé va vérifier vos photos, puis vous pourrez consulter.",
  'verification.etapeDocument': '1. Votre document',
  'verification.pieceIdentite': "Pièce d'identité (avec votre numéro {assurance})",
  'verification.acteNaissance': 'Acte de naissance',
  'verification.photoDocument': 'Photo de votre document',
  'verification.envoyerDocument': 'Envoyer la photo du document',
  'verification.etapeVisage': '2. Votre visage',
  'verification.photoVisage': 'Photo de votre visage',
  'verification.envoyerVisage': 'Envoyer la photo du visage',

  // Charte C-IDENTITE (brouillon à valider par le porteur de projet et le juriste)
  'charte.titre': "Charte de vérification d'identité",
  'charte.pourquoiTitre': 'Pourquoi nous vérifions votre identité',
  'charte.pourquoi':
    "Un médecin doit savoir qui il soigne. Cela protège votre dossier médical : personne d'autre ne peut consulter à votre place.",
  'charte.demandeTitre': 'Ce que nous vous demandons',
  'charte.demande':
    "Deux photos : votre document (pièce d'identité avec votre numéro {assurance}, ou acte de naissance), et votre visage.",
  'charte.quiTitre': 'Qui regarde vos photos',
  'charte.qui':
    "Seulement une personne de l'équipe Mbolo Santé, habilitée pour cela. Chaque consultation des photos est enregistrée. Aucun programme ni intelligence artificielle ne décide à sa place. Votre médecin ne voit pas vos photos.",
  'charte.ouTitre': 'Où et combien de temps',
  'charte.ou':
    'Vos photos sont gardées chiffrées, comme preuve de la vérification, puis supprimées. Nous gardons seulement le résultat.',
  'charte.droitsTitre': 'Vos droits',
  'charte.droits':
    'Vous pouvez voir, faire corriger ou supprimer vos informations, et retirer votre accord. Sans identité vérifiée, vous ne pourrez pas consulter.',
  'charte.version': "Charte de vérification d'identité, version {version}.",
  'charte.accord':
    "J'ai lu (ou on m'a lu) cette charte. J'accepte que Mbolo Santé garde une photo de mon document et de mon visage pour vérifier mon identité.",
  'charte.accepte': "J'accepte",
  'charte.refuse': 'Je refuse',
} as const satisfies Catalogue;
