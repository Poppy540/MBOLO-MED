# language: fr
# Données FICTIVES uniquement. Principe n°3 (consentement explicite et révocable, accès tracés) ; ADR-0009.
@identite @consentement @application
Fonctionnalité: Le patient décide qui lit son dossier, depuis son application
  Afin de garder la main sur mes données de santé
  En tant que patient
  Je veux partager mon dossier avec mon médecin, retirer ce partage quand je veux, et voir qui l'a lu.

  Scénario: Le patient partage son dossier avec le médecin de son rendez-vous, puis retire ce partage
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Quand "patient-fictif-01" ouvre l’application patient
    Et que le patient ouvre ses partages et accès
    Et que le patient demande à partager son dossier avec "prac-fictif-001"
    Et que le patient confirme avec le code reçu par SMS
    Et que le patient lit le texte de partage puis partage son dossier avec "prac-fictif-001"
    Alors le dossier médical contient un partage actif avec "Practitioner/prac-fictif-001"
    Quand "medecin-fictif-01" demande l'accès au dossier "pat-fictif-001"
    Alors l'accès est accordé avec le motif "consentement-partage-pro"
    Quand le patient retire le partage avec "prac-fictif-001" dans l’application
    Alors le dossier médical ne contient aucun partage actif avec "Practitioner/prac-fictif-001"
    Quand "medecin-fictif-01" demande l'accès au dossier "pat-fictif-001"
    Alors l'accès est refusé avec le motif "refus-sans-consentement"
    Quand le patient ouvre ses partages et accès
    Alors l’application montre qu’un professionnel de santé a lu le dossier, puis s’est vu refuser l’accès
    Et l’écran de l’"application patient" respecte les règles d’accessibilité

  Scénario: Sans accord explicite du patient, rien n'est partagé
    Étant donné que "patient-fictif-01" est connecté
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Quand "patient-fictif-01" ouvre l’application patient
    Et que le patient ouvre ses partages et accès
    Et que le patient demande à partager son dossier avec "prac-fictif-001"
    Et que le patient confirme avec le code reçu par SMS
    Et que le patient lit le texte de partage avec "prac-fictif-001" puis répond « Non, pas maintenant »
    Alors le dossier médical ne contient aucun partage actif avec "Practitioner/prac-fictif-001"

  Scénario: Sans le code reçu par SMS, rien n'est partagé
    Étant donné que "patient-fictif-01" est connecté
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Et que la boîte des notifications simulées est relevée
    Quand "patient-fictif-01" ouvre l’application patient
    Et que le patient ouvre ses partages et accès
    Et que le patient demande à partager son dossier avec "prac-fictif-001"
    Et que le patient renonce à recevoir le code
    Alors aucun code n’est envoyé au numéro "+241 00 00 00 01"
    Et le dossier médical ne contient aucun partage actif avec "Practitioner/prac-fictif-001"
