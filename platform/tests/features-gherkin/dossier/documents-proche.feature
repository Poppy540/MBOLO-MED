# language: fr
# Données FICTIVES uniquement. Principe n°3 (minimisation, consentement révocable, lecture tracée) ;
# décision du porteur de projet du 2026-09-28 : le proche voit le strict utile pour aider le patient.
@dossier @vague2
Fonctionnalité: Le proche désigné par le patient suit son traitement
  Afin d'aider un parent à suivre son traitement, même depuis l'étranger
  En tant que proche désigné par le patient
  Je veux voir ses ordonnances et les consignes du médecin, et rien d'autre.

  Scénario: Le proche voit l'ordonnance et la consigne, jamais le motif ni la conclusion, jusqu'au retrait du partage
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Et que "proche-fictif-01" est connecté
    Et que "patient-fictif-01" donne son consentement "C-PARTAGE-PRO" à "Practitioner/prac-fictif-001"
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Et que "medecin-fictif-01" rédige le compte-rendu de ce rendez-vous
    Et que "medecin-fictif-01" prescrit du paracétamol 500 mg 3 fois par jour pendant 5 jours pour ce rendez-vous
    Et que "patient-fictif-01" retire ce consentement
    Et que "patient-fictif-01" donne son consentement "C-PROCHE" à "RelatedPerson/rp-fictif-001"
    Quand "proche-fictif-01" ouvre l’application patient en tant que proche
    Alors l’application du proche affiche cette ordonnance et la consigne du médecin
    Et l’écran de l’"application patient" respecte les règles d’accessibilité
    Et l’application du proche n’affiche ni le motif ni la conclusion
    Quand "patient-fictif-01" retire ce consentement
    Et que "proche-fictif-01" demande les documents partagés par son proche
    Alors la lecture des documents est refusée

  Scénario: La lecture par le proche est tracée dans le dossier du patient
    Étant donné que "patient-fictif-01" est connecté
    Et que "proche-fictif-01" est connecté
    Et que "patient-fictif-01" donne son consentement "C-PROCHE" à "RelatedPerson/rp-fictif-001"
    Quand "proche-fictif-01" demande les documents partagés par son proche
    Alors les documents partagés lui sont remis, sans motif ni conclusion
    Quand "patient-fictif-01" consulte l'historique des accès au dossier "pat-fictif-001"
    Alors l'historique contient une lecture par le proche désigné
    Et que "patient-fictif-01" retire ce consentement

  Scénario: Sans partage, le proche ne voit rien ; un patient ou un médecin n'utilise pas ce chemin
    Étant donné que "proche-fictif-01" est connecté
    Et que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Quand "proche-fictif-01" demande les documents partagés par son proche
    Alors la lecture des documents est refusée
    Quand "patient-fictif-01" demande les documents partagés par son proche
    Alors la lecture des documents est refusée
    Quand "medecin-fictif-01" demande les documents partagés par son proche
    Alors la lecture des documents est refusée
