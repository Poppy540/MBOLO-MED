# language: fr
# Données FICTIVES uniquement ; micro simulé ; aucune consultation enregistrée. Règles : ADR-0010, ADR-0011.
@teleconsultation @vague1
Fonctionnalité: Téléconsultation vidéo entre un patient et son médecin
  Afin de consulter un médecin depuis son téléphone
  En tant que patient
  Je veux rejoindre une salle réservée à mon rendez-vous, où seuls mon médecin et moi pouvons entrer.

  Scénario: Le patient et le médecin du rendez-vous se retrouvent dans la salle et s'entendent
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Quand "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Alors le rendez-vous est enregistré
    Quand "patient-fictif-01" rejoint la téléconsultation
    Et que "medecin-fictif-01" rejoint la téléconsultation
    Alors "patient-fictif-01" entend "Professionnel de santé"
    Et "medecin-fictif-01" entend "Patient"

  Scénario: Le rendez-vous est enregistré dans le dossier médical, sans aucun motif
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Quand "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Alors le rendez-vous est enregistré
    Et le dossier médical contient ce rendez-vous entre "pat-fictif-001" et "prac-fictif-001", sans motif
    Et "patient-fictif-01" retrouve ce rendez-vous dans ses rendez-vous
    Et "medecin-fictif-01" retrouve ce rendez-vous dans ses rendez-vous

  Scénario: Un rendez-vous avec un professionnel inconnu du dossier est refusé
    Étant donné que "patient-fictif-01" est connecté
    Quand "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-999" maintenant
    Alors le rendez-vous est refusé par le dossier médical

  Scénario: Personne d'autre ne peut entrer dans la salle du rendez-vous
    Étant donné que "patient-fictif-01" est connecté
    Et que "patient-fictif-02" est connecté
    Et que "infirmier-fictif-01" est connecté
    Quand "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Et que "patient-fictif-02" demande à entrer dans la salle de ce rendez-vous
    Alors l'entrée dans la salle est refusée
    Quand "infirmier-fictif-01" demande à entrer dans la salle de ce rendez-vous
    Alors l'entrée dans la salle est refusée

  Scénario: La téléconsultation n'est proposée qu'à la cohorte activée
    Étant donné que "patient-fictif-02" est connecté
    Quand "patient-fictif-02" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Alors la téléconsultation n'est pas encore disponible pour ce compte

  Scénario: Le service exige une authentification
    Étant donné qu'aucun jeton n'est présenté au service de téléconsultation
    Alors le service de téléconsultation exige une authentification
