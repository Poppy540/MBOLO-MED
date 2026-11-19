# language: fr
# Données FICTIVES uniquement. Plan d'incident, écart E5 de l'exercice sur table n°1 : le compte
# d'un professionnel est volé. Sa fiche reste « vérifiée », mais tant que son compte est coupé il
# disparaît de l'annuaire et ses rendez-vous à venir sont repris par l'équipe d'assistance.
@teleconsultation @securite @vague1
Fonctionnalité: Le responsable sécurité coupe le compte d'un professionnel
  Afin qu'aucun patient ne prenne rendez-vous avec un compte volé
  En tant que responsable sécurité
  Je veux retirer ce professionnel de l'annuaire jusqu'au rétablissement de son compte.

  Scénario: Le compte coupé disparaît de l'annuaire, puis revient au rétablissement
    Étant donné que "securite-fictif-01" est connecté
    Et que "patient-fictif-01" est connecté
    Quand "securite-fictif-01" coupe le compte du professionnel "prac-fictif-002"
    Alors le compte du professionnel est coupé
    Et l’annuaire de "patient-fictif-01" montre "prac-fictif-001" et pas "prac-fictif-002"
    Et les créneaux de "prac-fictif-002" ne sont pas proposés à "patient-fictif-01"
    Quand "securite-fictif-01" rétablit le compte du professionnel "prac-fictif-002"
    Alors l’annuaire de "patient-fictif-01" montre "prac-fictif-002" et pas "prac-fictif-candidat"

  Scénario: Seul le responsable sécurité coupe le compte d'un professionnel
    Étant donné que "medecin-fictif-01" est connecté
    Quand "medecin-fictif-01" coupe le compte du professionnel "prac-fictif-002"
    Alors la coupure est refusée
