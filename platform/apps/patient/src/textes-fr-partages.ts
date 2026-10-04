// Textes de l'écran « Mes partages et accès » (ADR-0009, ADR-0025). Catalogue à part, chargé avec
// l'écran. Les clés `partages.accord*` forment le texte du consentement C-PARTAGE-PRO : sa version
// (VERSION_PARTAGE_PRO) est enregistrée avec l'accord ; toute traduction de ce texte est validée par
// le juriste et porte sa propre version.
import type { Catalogue } from '@mbolo/client-web';

export const frPartages = {
  'partages.titre': 'Mes partages et accès',
  'partages.chargement': 'Chargement…',
  'partages.indisponible': 'Service indisponible. Réessayez plus tard.',
  'partages.indisponibleCourt': 'Service indisponible.',
  'partages.votreMedecin': 'Votre médecin',
  'partages.votreProche': 'Votre proche',
  'partages.prenomProche': '{prenom} (votre proche)',
  'partages.unProfessionnel': 'Un professionnel de santé',
  'partages.partage': 'Votre dossier est partagé avec {nom}.',
  'partages.retire': 'Partage retiré.',
  'partages.partagerTitre': 'Partager mon dossier',
  // `{nom}` est affiché en gras : la phrase reste entière pour les traducteurs.
  'partages.accord':
    'J’accepte que {nom} lise mon dossier médical Mbolo Santé, et y écrive le compte-rendu et l’ordonnance de mes consultations.',
  'partages.accordRetrait':
    'Je peux retirer cet accord à tout moment, ici, dans « Mes partages et accès ». Chaque lecture de mon dossier est enregistrée et je peux la voir.',
  'partages.version': 'Texte de partage, version {version}.',
  'partages.jAccepte': 'J’accepte',
  'partages.pasMaintenant': 'Non, pas maintenant',
  'partages.quiPeutLire': 'Qui peut lire mon dossier',
  'partages.personne': 'Personne d’autre que vous.',
  'partages.enCours': 'Partages en cours',
  'partages.depuis': '— depuis le {date}',
  'partages.retirer': 'Retirer ce partage',
  'partages.partagerAvec': 'Partager mon dossier avec {nom}',
  'partages.quiADemande': 'Qui a demandé à lire mon dossier',
  'partages.personnePourLeMoment': 'Personne pour le moment.',
  'partages.historique': 'Accès à mon dossier',
  'partages.ligneAcces': '— {qui} :',
  'partages.accorde': 'accès accordé',
  'partages.refuse': 'accès refusé',
  'partages.urgence': 'Accès en urgence. Il sera vérifié par une personne de l’équipe.',
  'partages.urgenceMotif':
    'Accès en urgence : {motif}. Il sera vérifié par une personne de l’équipe.',
  'partages.vousMeme': 'Vous-même',
  'partages.assistant': 'L’assistant Mbolo Santé (programme informatique)',
  'partages.infirmier': 'Un infirmier',
  'partages.equipe': 'Une personne de l’équipe',
  'partages.retour': 'Retour',
} as const satisfies Catalogue;
