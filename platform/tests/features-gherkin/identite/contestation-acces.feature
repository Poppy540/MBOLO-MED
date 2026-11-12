# language: fr
# Données FICTIVES uniquement. Plan d'incident, écart E4 de l'exercice sur table n°1 : un patient
# ne reconnaît pas un accès à son dossier ; il le signale, sans texte libre, et le responsable
# sécurité le reçoit.
@identite @securite
Fonctionnalité: Le patient conteste un accès à son dossier
  Afin qu'un accès que je ne reconnais pas soit examiné
  En tant que patient
  Je veux le signaler depuis l'historique des accès à mon dossier.

  Scénario: Le patient conteste un accès en urgence, le responsable sécurité le voit
    Étant donné que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" est connecté
    Et que "securite-fictif-01" est connecté
    Quand "medecin-fictif-01" demande l'accès au dossier "pat-fictif-001" en urgence avec le motif "Accès à contester, exercice [FICTIF]"
    Et que "patient-fictif-01" conteste l'accès en urgence justifié par "Accès à contester, exercice [FICTIF]"
    Alors l'historique de "patient-fictif-01" montre cet accès comme contesté
    Quand "securite-fictif-01" consulte les contestations d'accès
    Alors la contestation de cet accès figure dans la liste, avec le compte qui a eu l'accès

  Scénario: Un médecin ne peut ni contester un accès ni voir les contestations
    Étant donné que "medecin-fictif-01" est connecté
    Quand "medecin-fictif-01" consulte les contestations d'accès
    Alors la demande est interdite
