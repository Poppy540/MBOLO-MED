// Textes de « Mes proches » (ADR-0019, ADR-0025), dans « Mes partages et accès » : chargés avec cet
// écran. Les clés `proches.accord*` forment le texte du consentement C-PROCHE : sa version
// (VERSION_PARTAGE_PROCHE) est enregistrée avec l'accord ; toute traduction de ce texte est validée
// par le juriste et porte sa propre version.
import type { Catalogue } from '@mbolo/client-web';

export const frProches = {
  'proches.titre': 'Mes proches',
  'proches.explication':
    'Un proche voit vos ordonnances et les consignes du médecin, jamais le reste du dossier.',
  'proches.indisponible': 'Service indisponible. Réessayez plus tard.',
  'proches.prenomManquant': 'Indiquez le prénom de votre proche.',
  'proches.numeroInternational': 'Numéro au format international, par exemple +{indicatif} …',
  'proches.smsEnvoye': 'Code envoyé par SMS à {prenom}.',
  'proches.smsEchec': 'Le SMS n’a pas pu partir.',
  'proches.secours': 'En secours, vous pouvez lui donner ce code vous-même :',
  'proches.codeValable': '— valable jusqu’au {date}.',
  'proches.liste': 'Mes proches',
  'proches.compteCree': 'A créé son compte.',
  'proches.invitationEnvoyee': 'Invitation envoyée, valable jusqu’au {date}.',
  'proches.retirer': 'Retirer ce proche',
  'proches.inviter': 'Inviter un proche',
  'proches.prenom': 'Prénom de votre proche',
  'proches.quiEstCe': 'Qui est-ce ?',
  'proches.telephone': 'Son numéro de téléphone (avec l’indicatif du pays)',
  // `{prenom}` est affiché en gras : la phrase reste entière pour les traducteurs.
  'proches.accord':
    'J’accepte que {prenom} voie mes ordonnances et les consignes de mon médecin (« Ce qu’il faut faire »), jamais le reste de mon dossier.',
  'proches.monProche': 'mon proche',
  'proches.accordRetrait':
    'Je peux retirer cet accord à tout moment, ici. Chaque lecture est enregistrée et je peux la voir. Mbolo Santé enverra un code à ce numéro par SMS ; le numéro n’est pas gardé.',
  'proches.version': 'Texte de partage, version {version}.',
  'proches.accepterEtEnvoyer': 'J’accepte et j’envoie le code',
  'proches.annuler': 'Annuler',
  'proches.lienEnfant': 'Mon enfant',
  'proches.lienConjoint': 'Mon conjoint ou ma conjointe',
  'proches.lienFrereSoeur': 'Mon frère ou ma sœur',
  'proches.lienParent': 'Mon parent',
  'proches.lienFamille': 'Un autre membre de ma famille',
  'proches.lienAmi': 'Un ami ou une amie',
} as const satisfies Catalogue;
