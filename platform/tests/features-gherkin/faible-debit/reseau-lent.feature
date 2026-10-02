# language: fr
# Données FICTIVES uniquement. Réseau simulé par Chrome (profil « 3G lente » : 2 s de latence par
# requête, 50 000 octets par seconde), pas un vrai réseau mobile : les tests terrain le complètent.
@faible-debit @vague1
Fonctionnalité: Les applications s'ouvrent sur un réseau mobile lent
  Afin de pouvoir consulter même avec une connexion 3G faible et des données mobiles chères
  En tant que patient ou professionnel
  Je veux que l'écran d'accueil s'affiche vite, sans télécharger plus que nécessaire.

  Scénario: Sur une 3G lente, l'application patient s'ouvre vite et avec peu de données
    Quand l’"application patient" s’ouvre pour la première fois sur un réseau 3G lent
    Alors l’écran d’accueil s’affiche en moins de 8 secondes
    Et moins de 30 Ko ont été téléchargés
    Et l’application rappelle, même sans réseau, d’appeler les secours en cas d’urgence

  Scénario: Sur une 3G lente, l'espace professionnel s'ouvre vite et avec peu de données
    Quand l’"espace professionnel" s’ouvre pour la première fois sur un réseau 3G lent
    Alors l’écran d’accueil s’affiche en moins de 8 secondes
    Et moins de 30 Ko ont été téléchargés
