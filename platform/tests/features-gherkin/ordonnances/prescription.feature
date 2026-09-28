# language: fr
# Données FICTIVES uniquement. Règles : ADR-0018 (proposée, suspendue à l'avis juridique), principes n°1 et n°8.
@ordonnances @vague2
Fonctionnalité: Ordonnance électronique prescrite par le médecin de la consultation
  Afin que le patient reparte avec un traitement clair, sans papier
  En tant que médecin
  Je veux prescrire une ordonnance structurée dans le dossier, et pouvoir la révoquer avant sa délivrance.

  Scénario: Le médecin prescrit une ordonnance structurée, puis la révoque
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" donne son consentement "C-PARTAGE-PRO" à "Practitioner/prac-fictif-001"
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Quand "medecin-fictif-01" prescrit du paracétamol 500 mg 3 fois par jour pendant 5 jours pour ce rendez-vous
    Alors l'ordonnance est enregistrée dans le dossier, prescrite par "prac-fictif-001", sans texte libre
    Quand "medecin-fictif-01" révoque cette ordonnance
    Alors le dossier médical indique que cette ordonnance est révoquée
    Quand "patient-fictif-01" retire ce consentement

  Scénario: Sans partage du dossier, le médecin ne peut pas prescrire
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Quand "medecin-fictif-01" prescrit du paracétamol 500 mg 3 fois par jour pendant 5 jours pour ce rendez-vous
    Alors la prescription est refusée

  Scénario: Un patient ne peut ni prescrire ni révoquer une ordonnance
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" donne son consentement "C-PARTAGE-PRO" à "Practitioner/prac-fictif-001"
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Quand "patient-fictif-01" prescrit du paracétamol 500 mg 3 fois par jour pendant 5 jours pour ce rendez-vous
    Alors la prescription est refusée
    Quand "medecin-fictif-01" prescrit du paracétamol 500 mg 3 fois par jour pendant 5 jours pour ce rendez-vous
    Et que "patient-fictif-01" révoque cette ordonnance
    Alors la révocation est refusée
    Quand "patient-fictif-01" retire ce consentement
