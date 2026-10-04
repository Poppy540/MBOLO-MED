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

  Scénario: Le médecin publie ses créneaux et le patient en réserve un
    Étant donné que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" est connecté
    Quand "medecin-fictif-01" publie 2 créneaux de 20 minutes dans 2 jours
    Alors les créneaux sont publiés
    Et "patient-fictif-01" voit ces créneaux libres chez "prac-fictif-001"
    Quand "patient-fictif-01" réserve le premier de ces créneaux
    Alors le rendez-vous est enregistré
    Et le dossier médical contient ce rendez-vous entre "pat-fictif-001" et "prac-fictif-001", sans motif
    Et "patient-fictif-01" ne voit plus ce créneau chez "prac-fictif-001"
    Quand "patient-fictif-01" réserve le premier de ces créneaux
    Alors la réservation est refusée car le créneau n'est plus disponible
    Quand "medecin-fictif-01" publie 1 créneaux de 20 minutes dans 2 jours
    Alors la publication est refusée car les créneaux se chevauchent

  Scénario: Un créneau inconnu ne peut pas être réservé
    Étant donné que "patient-fictif-01" est connecté
    Quand "patient-fictif-01" réserve le créneau "creneau-fictif-inconnu"
    Alors la réservation est refusée car le créneau est introuvable

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

  Scénario: Le patient annule son rendez-vous : la salle se ferme, le créneau se libère et le dossier garde la trace
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Quand "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Et que "patient-fictif-01" annule ce rendez-vous
    Alors le rendez-vous est annulé
    Et le dossier médical conserve ce rendez-vous annulé par "patient", sans motif
    Et "patient-fictif-01" voit ces créneaux libres chez "prac-fictif-001"
    Quand "medecin-fictif-01" demande à entrer dans la salle de ce rendez-vous
    Alors la salle est fermée pour ce rendez-vous

  Scénario: Le médecin annule le rendez-vous ; personne d'autre ne le peut
    Étant donné que "patient-fictif-01" est connecté
    Et que "patient-fictif-02" est connecté
    Et que "medecin-fictif-01" est connecté
    Quand "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Et que "patient-fictif-02" annule ce rendez-vous
    Alors l'annulation est refusée car le rendez-vous est introuvable
    Quand "medecin-fictif-01" annule ce rendez-vous
    Alors le rendez-vous est annulé
    Et le dossier médical conserve ce rendez-vous annulé par "professionnel", sans motif

  Scénario: Le patient reporte son rendez-vous sur un autre créneau du même médecin
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Quand "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Et que "medecin-fictif-01" publie 1 créneaux de 20 minutes dans 3 jours
    Et que "patient-fictif-01" reporte ce rendez-vous sur le premier de ces créneaux
    Alors le rendez-vous est reporté
    Et le dossier médical rattache ce rendez-vous au nouveau créneau
    Et "patient-fictif-01" ne voit plus ce créneau chez "prac-fictif-001"
    Et "patient-fictif-01" voit de nouveau le créneau initial chez "prac-fictif-001"

  Scénario: Le médecin retire un créneau libre, mais pas un créneau réservé
    Étant donné que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" est connecté
    Quand "medecin-fictif-01" publie 2 créneaux de 20 minutes dans 4 jours
    Et que "medecin-fictif-01" retire le premier de ces créneaux
    Alors le créneau est retiré
    Et "patient-fictif-01" ne voit plus ce créneau chez "prac-fictif-001"
    Quand "patient-fictif-01" réserve le dernier de ces créneaux
    Et que "medecin-fictif-01" retire le dernier de ces créneaux
    Alors le retrait est refusé car le créneau est réservé

  Scénario: Le médecin est prévenu, sans donnée de santé, quand le patient annule
    Étant donné que "patient-fictif-01" est connecté
    Et que la boîte des notifications simulées est relevée
    Quand "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Et que "patient-fictif-01" annule ce rendez-vous
    Alors le numéro "+241 00 00 00 02" reçoit le message "est annulé"

  Scénario: Le patient n'est prévenu que s'il a accepté les rappels
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Et que la boîte des notifications simulées est relevée
    Quand "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Et que "medecin-fictif-01" annule ce rendez-vous
    Alors le numéro "+241 00 00 00 01" ne reçoit aucun message
    Quand "patient-fictif-01" accepte de recevoir les rappels
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Et que "medecin-fictif-01" publie 1 créneaux de 20 minutes dans 5 jours
    Et que "medecin-fictif-01" reporte ce rendez-vous sur le premier de ces créneaux
    # Son dossier indique l'anglais, sans gabarits approuvés : le SMS reste en français (ADR-0025).
    Alors le numéro "+241 00 00 00 01" reçoit le message "est déplacé au"
