// Textes de l'écran « Mes comptes-rendus et ordonnances » (ADR-0025). Catalogue à part, chargé avec
// l'écran. Les textes écrits par le médecin ne passent jamais par ce catalogue : ils s'affichent tels
// quels (principe n°1). Les consignes de sécurité (« Ne changez pas votre traitement… ») sont à
// valider par le comité médical dans chaque langue.
import type { Catalogue } from '@mbolo/client-web';

export const frDocuments = {
  'documents.titre': 'Mes comptes-rendus et ordonnances',
  'documents.titreProche': 'Ordonnances et consignes de votre proche',
  'documents.partageProche':
    'Votre proche partage avec vous ses ordonnances et les consignes du médecin. Il peut retirer ce partage à tout moment.',
  'documents.chargement': 'Chargement…',
  'documents.indisponible': 'Service indisponible. Réessayez plus tard.',
  'documents.sansConnexion': '{erreur} Vos documents s’affichent seulement avec une connexion.',
  'documents.ordonnances': 'Ordonnances',
  'documents.aucuneOrdonnance': 'Aucune ordonnance.',
  'documents.ordonnanceDu': 'Ordonnance du {date}',
  'documents.valable': 'Valable jusqu’au {date}',
  'documents.revoquee': 'Annulée par le médecin : ne pas l’utiliser.',
  'documents.plusUtilisable': 'Ordonnance plus utilisable.',
  'documents.ligne': '{dose}, {frequence}, pendant {duree}',
  'documents.duree': { one: '{nombre} jour', other: '{nombre} jours' },
  'documents.fois': '{fois} fois',
  'documents.parHeure': '{fois} fois par heure',
  'documents.parJour': '{fois} fois par jour',
  'documents.parSemaine': '{fois} fois par semaine',
  'documents.toutesHeures': '{fois} fois toutes les {periode} heures',
  'documents.toutesJours': '{fois} fois toutes les {periode} jours',
  'documents.toutesSemaines': '{fois} fois toutes les {periode} semaines',
  'documents.comptesRendus': 'Comptes-rendus',
  'documents.consignes': 'Consignes du médecin',
  'documents.aucunCompteRendu': 'Aucun compte-rendu.',
  'documents.aucuneConsigne': 'Aucune consigne.',
  'documents.motif': 'Motif',
  'documents.observations': 'Observations',
  'documents.conclusion': 'Conclusion',
  'documents.conduiteATenir': 'Ce qu’il faut faire',
  'documents.rubrique': '{titre} :',
  'documents.prudence': 'Ne changez pas votre traitement sans l’avis d’un médecin.',
  'documents.urgence': 'En cas d’urgence, appelez les secours.',
  'documents.retour': 'Retour',
} as const satisfies Catalogue;
