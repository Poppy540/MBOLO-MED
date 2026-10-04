// Catalogue de référence de l'application patient : le français (ADR-0025). Ses clés sont celles de
// toutes les langues ; une langue ajoutée reprend ces clés dans son propre fichier, traduit par des
// humains et validé (juriste pour les consentements, comité médical pour l'urgence et les conseils).
// Les écrans chargés à la demande ont chacun leur catalogue (`textes-fr-<écran>.ts`).
import type { Catalogue } from '@mbolo/client-web';

export const fr = {
  // Commun
  'appli.nom': 'Mbolo Santé',
  'commun.chargement': 'Chargement…',
  'commun.retour': 'Retour',
  'commun.seDeconnecter': 'Se déconnecter',
  'commun.serviceIndisponible': 'Service indisponible. Réessayez plus tard.',
  'commun.pasDeReseau': 'Pas de réseau. Réessayez plus tard.',
  'commun.duree': '({minutes} min)',
  'connexion.echec': 'La connexion a échoué. Réessayez.',

  // Bandeau d'urgence, sur tous les écrans (principe n°2)
  'secours.appelez': "En cas d'urgence, appelez les secours.",
  'secours.appelezNumeros': "En cas d'urgence, appelez les secours :",
  'secours.numero': '{nom} ({numero})',

  // Accueil
  'accueil.presentation': 'Consultez un médecin depuis votre téléphone.',
  'accueil.seConnecter': 'Se connecter',
  'accueil.codeInvitation': "J'ai un code d'invitation",
  'langue.choisir': 'Langue',

  // Dossier à compléter (ADR-0014)
  'dossier.identiteRefusee':
    "Votre identité n'a pas pu être confirmée. L'équipe Mbolo Santé va vous recontacter.",
  'dossier.compteCree': 'Votre compte est créé.',
  'dossier.verificationAttendue':
    "Avant votre première consultation, votre identité doit être vérifiée. L'équipe Mbolo Santé vous contactera.",
  'dossier.verifierIdentite': 'Vérifier mon identité',

  // Confirmation par SMS avant une action sensible (ADR-0022)
  'sms.titre': 'Confirmer par SMS',
  'sms.explicationPayer':
    'Avant de payer, nous envoyons un code par SMS au numéro de votre dossier. Il protège votre compte si quelqu’un d’autre connaît votre mot de passe.',
  'sms.explicationPartager':
    'Avant de partager votre dossier ou d’inviter un proche, nous envoyons un code par SMS au numéro de votre dossier. Il protège votre compte si quelqu’un d’autre connaît votre mot de passe.',
  'sms.neDonnezPas': 'Ne donnez ce code à personne, même pas à l’équipe.',
  'sms.recevoirCode': 'Recevoir le code',
  'sms.plusDeTelephone': 'Plus de téléphone ou plus de numéro ? Appelez l’équipe Mbolo Santé.',

  // Changer de numéro (ADR-0023)
  'numero.titre': 'Changer mon numéro',
  'numero.nouvellePuce': 'Vous avez une nouvelle puce ? Il vous faut vos deux téléphones :',
  'numero.etape1': 'un code arrive par SMS à votre numéro actuel ;',
  'numero.etape2': 'vous écrivez votre nouveau numéro ;',
  'numero.etape3': 'un autre code arrive à ce nouveau numéro.',
  'numero.ancienPrevenu':
    'Votre ancien numéro recevra un message pour vous prévenir du changement.',
  'numero.perduTitre': 'Vous avez perdu votre téléphone ?',
  'numero.perduExplication':
    'Indiquez votre nouveau numéro, puis envoyez deux nouvelles photos. Une personne de l’équipe Mbolo Santé vérifiera que c’est bien vous avant de changer le numéro.',
  'numero.perdu': 'J’ai perdu mon téléphone',
  'numero.envoyerPhotos': 'Envoyer mes photos (demande déjà faite)',
  'numero.change': 'Votre numéro est changé. Les prochains codes arriveront à ce numéro.',
  'numero.inchange': 'Votre numéro n’a pas changé.',
  'numero.echec': 'Votre numéro n’a pas pu être changé. Réessayez plus tard.',
  'numero.perteEnregistree': 'Demande enregistrée. Envoyez maintenant deux nouvelles photos.',

  // Application d'authentification (ADR-0024)
  'proteger.titre': 'Protéger mon compte',
  'proteger.explication':
    'Pour payer ou partager votre dossier, vous recevez un code par SMS. Vous pouvez le remplacer par le code d’une application gratuite sur votre téléphone : Google Authenticator, Microsoft Authenticator ou FreeOTP.',
  'proteger.plusSur':
    'C’est plus sûr : même si quelqu’un vole votre puce, il ne pourra pas recevoir vos codes. Ensuite, les codes ne viendront plus par SMS.',
  'proteger.etape1': 'un code arrive d’abord par SMS ;',
  'proteger.etape2': 'vous ajoutez Mbolo Santé dans votre application (code à scanner) ;',
  'proteger.etape3': 'vous tapez le code affiché par l’application.',
  'proteger.activer': 'Activer une application',
  'proteger.dejaTitre': 'Vous avez déjà une application ?',
  'proteger.dejaExplication':
    'Avec un code de votre application, vous pouvez la retirer : les codes reviendront par SMS.',
  'proteger.retirer': 'Retirer mon application',
  'proteger.perdu':
    'Téléphone ou application perdus ? Appelez l’équipe Mbolo Santé : elle vérifiera que c’est bien vous.',
  'proteger.activee':
    'Votre application protège maintenant votre compte. Les codes ne viendront plus par SMS.',
  'proteger.activationAnnulee': 'Rien n’a changé : vos codes arrivent toujours par SMS.',
  'proteger.activationEchec': 'L’application n’a pas pu être activée. Réessayez plus tard.',
  'proteger.retiree': 'Votre application est retirée. Les codes reviennent par SMS.',
  'proteger.retraitAnnule': 'Rien n’a changé : votre application protège toujours votre compte.',
  'proteger.retraitEchec': 'L’application n’a pas pu être retirée. Réessayez plus tard.',

  // Mes rendez-vous
  'rendezVous.titre': 'Mes rendez-vous',
  'rendezVous.aucun': 'Aucun rendez-vous prévu.',
  'rendezVous.liste': 'Rendez-vous prévus',
  'rendezVous.attentePaiement': 'En attente de paiement',
  'rendezVous.payer': 'Payer',
  'rendezVous.rejoindre': 'Rejoindre',
  'rendezVous.deplacer': 'Déplacer',
  'rendezVous.annuler': 'Annuler',
  'rendezVous.prendre': 'Prendre rendez-vous',
  'rendezVous.documents': 'Mes comptes-rendus et ordonnances',
  'rendezVous.partages': 'Mes partages et accès',
  'rendezVous.recus': 'Mes reçus',
  'consultation.autre': 'Professionnel de santé',

  // Créneaux
  'creneaux.titre': 'Créneaux libres',
  'creneaux.aucun': 'Aucun créneau libre pour le moment.',
  'creneaux.deplacerTitre': 'Déplacer le rendez-vous',
  'creneaux.confirmerTitre': 'Confirmer le rendez-vous',
  'creneaux.auLieuDe': 'Au lieu de :',
  'creneaux.deplacerIci': 'Déplacer ici',
  'creneaux.reserver': 'Réserver',
  'creneaux.deplace': 'Rendez-vous déplacé.',
  'creneaux.reserve': 'Rendez-vous réservé.',

  // Annuaire
  'annuaire.titre': 'Choisir un médecin',
  'annuaire.specialite': 'Spécialité',
  'annuaire.toutes': 'Toutes',
  'annuaire.aucun': 'Aucun médecin disponible pour le moment.',
  'annuaire.liste': 'Médecins',
  'annuaire.prochainCreneau': 'Prochain créneau : {date}',
  'annuaire.pasDeCreneau': 'Pas de créneau libre pour le moment',
} as const satisfies Catalogue;

export type CleTexte = keyof typeof fr;
