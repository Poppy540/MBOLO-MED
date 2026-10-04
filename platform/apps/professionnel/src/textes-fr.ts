// Catalogue de référence de l'espace professionnel : le français (ADR-0025). Ses clés sont celles de
// toutes les langues ; une langue ajoutée (l'anglais, si le porteur de projet le retient pour les
// professionnels venus du monde entier) reprend ces clés dans son propre fichier, traduit par des
// humains et validé. Les écrans chargés à la demande ont chacun leur catalogue (`textes-fr-<écran>.ts`).
import type { Catalogue } from '@mbolo/client-web';

export const fr = {
  // Commun
  'appli.nom': 'Mbolo Santé Pro',
  'commun.chargement': 'Chargement…',
  'commun.retour': 'Retour',
  'commun.seDeconnecter': 'Se déconnecter',
  'commun.serviceIndisponible': 'Service indisponible. Réessayez plus tard.',
  'commun.pasDeReseau': 'Pas de réseau. Réessayez plus tard.',
  'commun.duree': '({minutes} min)',
  'connexion.echec': 'La connexion a échoué. Réessayez.',

  // Accueil et menu
  'accueil.presentation': 'Espace des professionnels de santé.',
  'accueil.seConnecter': 'Se connecter',
  'menu.rendezVous': 'Rendez-vous',
  'menu.creneaux': 'Mes créneaux',
  'menu.verifications': 'Vérifications',
  'menu.pertes': 'Numéros perdus',
  'menu.remboursements': 'Remboursements',
  'menu.assistance': 'Assistance',
  'consultation.autre': 'Patient',

  // Rendez-vous
  'rendezVous.titre': 'Rendez-vous à venir',
  'rendezVous.aucun': 'Aucun rendez-vous prévu.',
  'rendezVous.liste': 'Rendez-vous prévus',
  'rendezVous.rejoindre': 'Rejoindre',
  'rendezVous.dossier': 'Dossier',
  'rendezVous.reporter': 'Reporter',
  'rendezVous.annuler': 'Annuler',

  // Report
  'report.titre': 'Reporter le rendez-vous du {date}',
  'report.aucunCreneau': 'Aucun créneau libre : publiez-en d’abord.',
  'report.creneauxLibres': 'Créneaux libres',
  'report.fait': 'Rendez-vous reporté. Le patient est prévenu.',

  // Créneaux
  'creneaux.publierTitre': 'Publier des créneaux',
  'creneaux.date': 'Date',
  'creneaux.heure': 'Heure de début',
  'creneaux.duree': 'Durée',
  'creneaux.minutes': '{minutes} min',
  'creneaux.nombre': 'Nombre de créneaux',
  'creneaux.publier': 'Publier',
  'creneaux.publies': { one: '{nombre} créneau publié.', other: '{nombre} créneaux publiés.' },
  'creneaux.mesCreneaux': 'Mes créneaux (14 jours)',
  'creneaux.aucun': 'Aucun créneau publié.',
  'creneaux.liste': 'Mes créneaux',
  'creneaux.libre': 'libre',
  'creneaux.reserve': 'réservé',
  'creneaux.retirer': 'Retirer',

  // Dossier du patient (le texte écrit par le professionnel s'affiche tel quel)
  'dossier.titre': 'Dossier — rendez-vous du {date}',
  'dossier.nonPartage': 'Le patient n’a pas partagé son dossier avec vous.',
  'dossier.brisDeGlace': 'Accès d’urgence (bris de glace)',
  'dossier.brisDeGlaceExplication':
    'Réservé à une urgence vitale. Votre motif est enregistré, signalé au patient et revu par un humain.',
  'dossier.motifAcces': 'Motif',
  'dossier.accederUrgence': 'Accéder en urgence',
  'dossier.accesUrgence': 'Accès d’urgence : cette consultation du dossier sera revue.',
  'dossier.problemes': 'Problèmes de santé',
  'dossier.aucunProbleme': 'Aucun problème enregistré.',
  'dossier.parProfessionnel': '(posé par un professionnel)',
  'dossier.declare': '(déclaré, non confirmé)',
  'dossier.comptesRendus': 'Comptes-rendus',
  'dossier.aucunCompteRendu': 'Aucun compte-rendu.',
  'dossier.rubrique': '{titre} :',
  'dossier.rediger': 'Rédiger le compte-rendu',
  'dossier.enregistrer': 'Enregistrer le compte-rendu',
  'dossier.enregistre': 'Compte-rendu enregistré dans le dossier.',
  'cr.motifConsultation': 'Motif de consultation',
  'cr.motif': 'Motif',
  'cr.observations': 'Observations',
  'cr.conclusion': 'Conclusion',
  'cr.conduiteATenir': 'Conduite à tenir',
} as const satisfies Catalogue;

export type CleTexte = keyof typeof fr;
