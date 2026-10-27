// Textes de l'écran « Ma candidature » (ADR-0026, ADR-0025). Catalogue chargé avec l'écran.
// La charte reprend la partie « Texte présenté au professionnel » du brouillon
// docs/securite/charte-verification-professionnels.md : à remplacer mot pour mot par le texte
// validé par le porteur de projet et le juriste (version c-verification-pro-v0.1 en attendant).
import type { Catalogue } from '@mbolo/client-web';

export const frCandidature = {
  'cand.titre': 'Ma candidature',
  'cand.chargement': 'Chargement…',
  'cand.indisponible': 'Service indisponible. Réessayez plus tard.',
  'cand.statut.a-verifier':
    'Votre dossier est en attente de vérification. Vous n’avez accès à aucun patient tant qu’il n’est pas vérifié.',
  'cand.statut.verifie':
    'Votre dossier est vérifié. Déconnectez-vous puis reconnectez-vous pour accéder à vos consultations.',
  'cand.statut.refuse': 'Votre candidature n’a pas été retenue.',
  'cand.statut.suspendu': 'Votre activité est suspendue. Contactez l’équipe Mbolo Santé.',
  'cand.statut.inconnu': 'Votre fiche est introuvable. Contactez l’équipe de recrutement.',
  'charte.titre': 'Charte de vérification',
  'charte.brouillon': 'Texte provisoire, en attente de validation.',
  'charte.pourquoiTitre': 'Pourquoi nous vérifions votre dossier',
  'charte.pourquoi':
    'Les patients de Mbolo Santé doivent pouvoir faire confiance à chaque professionnel qu’ils consultent. Avant votre première consultation, nous vérifions donc votre identité, votre diplôme et votre inscription à l’Ordre. Tant que cette vérification n’est pas terminée, votre compte reste en attente : vous n’avez accès à aucun patient.',
  'charte.demandeTitre': 'Ce que nous vous demandons',
  'charte.demande':
    'Des photos lisibles de votre diplôme, de votre attestation d’inscription à l’Ordre de votre pays d’exercice, de votre pièce d’identité et, si elle est demandée, de votre attestation d’assurance de responsabilité civile professionnelle. Photos JPEG ou PNG, 2 Mo au plus chacune, deux au plus par pièce.',
  'charte.commentTitre': 'Comment se passe la vérification',
  'charte.comment':
    'Une personne de l’équipe spécialement habilitée, jamais celle qui vous a recruté, examine votre dossier et consulte la source officielle (registre de l’Ordre, ou attestation demandée à l’Ordre). Chaque consultation de vos pièces est enregistrée. Aucun programme informatique ni intelligence artificielle ne décide à sa place.',
  'charte.ouTitre': 'Où sont gardées vos pièces, et combien de temps',
  'charte.ou':
    'Vos pièces sont gardées chiffrées chez notre hébergeur de données de santé, pendant votre collaboration avec Mbolo Santé puis une durée limitée, ou quelques mois si votre candidature n’est pas retenue. Ensuite, elles sont supprimées. Elles ne sont jamais montrées aux patients, vendues, ni utilisées pour de la publicité.',
  'charte.droitsTitre': 'Vos droits',
  'charte.droits':
    'Vous pouvez voir les informations que nous avons sur vous, les faire corriger, retirer votre candidature et demander la suppression de vos pièces. Vous pouvez aussi vous adresser à l’autorité de protection des données personnelles.',
  'charte.version': 'Version {version}',
  'charte.accord':
    'En acceptant, vous confirmez avoir lu cette charte et accepter que vos pièces soient utilisées uniquement pour vérifier votre droit d’exercer.',
  'charte.accepte': 'J’accepte',
  'charte.refuse': 'Je refuse',
  'charte.refusee':
    'Sans votre accord, votre dossier ne peut pas être vérifié et votre compte reste en attente. Vous pouvez relire la charte quand vous voulez.',
  'decl.titre': 'Ma déclaration',
  'decl.explication':
    'Ces informations seront contrôlées à la source par la personne qui vérifie votre dossier. Vous pouvez les corriger tant que la vérification n’est pas faite.',
  'decl.specialite': 'Spécialité',
  'decl.choisir': 'Choisir…',
  'decl.paysOrdre': 'Pays de l’Ordre (code à 2 lettres, ex. GA pour le Gabon)',
  'decl.numeroOrdre': 'Numéro d’inscription à l’Ordre',
  'decl.langues': 'Langues de consultation',
  'decl.enregistrer': 'Enregistrer ma déclaration',
  'decl.enregistree': 'Déclaration enregistrée.',
  'decl.incomplete': 'Choisissez une spécialité et au moins une langue, et remplissez l’Ordre.',
  'pieces.titre': 'Mes pièces',
  'pieces.explication':
    'Une photo nette par pièce (recto et verso : deux photos au plus). Elles sont envoyées chiffrées et ne restent pas sur cet appareil.',
  'pieces.diplome': 'Diplôme',
  'pieces.inscription-ordre': 'Attestation d’inscription à l’Ordre (moins de 3 mois)',
  'pieces.piece-identite': 'Pièce d’identité',
  'pieces.assurance-rcp': 'Assurance de responsabilité civile professionnelle (si demandée)',
  'pieces.deposees': {
    one: '{nombre} photo envoyée',
    other: '{nombre} photos envoyées',
  },
  'pieces.aucune': 'Aucune photo envoyée',
  'pieces.photo': 'Photo : {piece}',
  'pieces.envoyer': 'Envoyer',
  'pieces.envoyee': 'Photo envoyée.',
  'pieces.choisir': 'Choisissez d’abord une photo.',
  'pieces.imageIllisible': 'Cette image ne peut pas être lue. Choisissez une photo JPEG ou PNG.',
  'pieces.tropLourde': 'Photo trop lourde, même réduite. Reprenez-la de plus près.',
} as const satisfies Catalogue;
