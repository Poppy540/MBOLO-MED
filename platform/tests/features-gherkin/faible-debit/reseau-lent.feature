# language: fr
# Données FICTIVES uniquement. Réseau simulé par Chrome (profil « 3G lente » : 2 s de latence par
# requête, 50 000 octets par seconde), pas un vrai réseau mobile : les tests terrain le complètent.
# Consultation : octets envoyés et reçus par l'application patient (statistiques WebRTC), médecin
# dans le vrai espace professionnel ; caméra simulée par Chrome (image animée, cas défavorable).
@faible-debit @vague1
Fonctionnalité: Les applications restent légères sur un réseau mobile lent
  Afin de pouvoir consulter même avec une connexion 3G faible et des données mobiles chères
  En tant que patient ou professionnel
  Je veux que l'écran d'accueil s'affiche vite et qu'une consultation coûte peu de données mobiles.

  Scénario: Sur une 3G lente, l'application patient s'ouvre vite et avec peu de données
    Quand l’"application patient" s’ouvre pour la première fois sur un réseau 3G lent
    Alors l’écran d’accueil s’affiche en moins de 8 secondes
    Et moins de 30 Ko ont été téléchargés
    Et l’application rappelle, même sans réseau, d’appeler les secours en cas d’urgence

  Scénario: Sur une 3G lente, l'espace professionnel s'ouvre vite et avec peu de données
    Quand l’"espace professionnel" s’ouvre pour la première fois sur un réseau 3G lent
    Alors l’écran d’accueil s’affiche en moins de 8 secondes
    Et moins de 30 Ko ont été téléchargés

  Scénario: Une consultation vidéo consomme peu de données, et encore moins en audio seulement
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Quand "patient-fictif-01" ouvre l’application patient pour "prac-fictif-001"
    Et que le patient rejoint ce rendez-vous dans l’application
    Et que "medecin-fictif-01" ouvre l’espace professionnel
    Et que le professionnel rejoint ce rendez-vous dans l’espace professionnel
    Alors l’espace professionnel indique que le patient est connecté
    Et l’application indique que le professionnel de santé est connecté
    Et en "vidéo", l’application patient consomme moins de 2500 Ko par minute
    Quand le patient passe en audio seulement
    Alors l’application ne reçoit plus que le son
    Et en "audio seulement", l’application patient consomme moins de 350 Ko par minute
