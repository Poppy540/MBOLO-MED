# language: fr
# Données FICTIVES uniquement. Plan d'incident : couper un compte compromis (écart E3 de l'exercice
# sur table n°1). Le responsable sécurité établit ce qu'un compte a demandé, sans voir aucun dossier.
@identite @securite
Fonctionnalité: Traces d'un compte depuis une date
  Afin d'établir quels dossiers un compte compromis a demandés et obtenus
  En tant que responsable sécurité
  Je veux lister toutes les traces d'accès de ce compte depuis une heure donnée.

  Scénario: Le responsable sécurité retrouve les dossiers obtenus par un compte
    Étant donné que "medecin-fictif-01" est connecté
    Et que "securite-fictif-01" est connecté
    Quand "medecin-fictif-01" demande l'accès au dossier "pat-fictif-002" en urgence avec le motif "Compte à vérifier, exercice [FICTIF]"
    Et que "securite-fictif-01" consulte les traces de "medecin-fictif-01" depuis une heure
    Alors les traces contiennent un accès en urgence accordé au dossier "pat-fictif-002"
    Et le dossier "pat-fictif-002" figure parmi les dossiers obtenus par ce compte

  Scénario: Un médecin ne peut pas consulter les traces d'un compte
    Étant donné que "medecin-fictif-01" est connecté
    Quand "medecin-fictif-01" consulte les traces de "medecin-fictif-01" depuis une heure
    Alors la demande est interdite
