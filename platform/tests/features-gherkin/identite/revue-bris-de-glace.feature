# language: fr
# Données FICTIVES uniquement. Règle : ADR-0009 (bris de glace revu par un humain).
# Qui relit, et sous quel délai, est décidé par le porteur de projet (rôle revue-acces, délai configurable).
@identite @securite @revue
Fonctionnalité: Revue humaine des accès d'urgence (bris de glace)
  Afin qu'aucun accès d'urgence au dossier d'un patient ne reste sans contrôle
  En tant que relecteur habilité
  Je veux voir les bris de glace à revoir et enregistrer ma conclusion,
  sans jamais avoir accès moi-même au contenu du dossier.

  Scénario: Un bris de glace est revu puis sort de la liste à revoir
    Étant donné que "medecin-fictif-01" est connecté
    Et que "relecteur-fictif-01" est connecté
    Quand "medecin-fictif-01" demande l'accès au dossier "pat-fictif-002" en urgence avec le motif "Détresse respiratoire, patient seul [FICTIF]"
    Et que "relecteur-fictif-01" consulte les bris de glace à revoir
    Alors la liste contient l'accès en urgence justifié par "Détresse respiratoire, patient seul [FICTIF]"
    Quand "relecteur-fictif-01" conclut que cet accès est "justifie"
    Et que "relecteur-fictif-01" consulte les bris de glace à revoir
    Alors cet accès n'est plus à revoir

  Scénario: Un médecin ne peut pas consulter les bris de glace à revoir
    Étant donné que "medecin-fictif-01" est connecté
    Quand "medecin-fictif-01" consulte les bris de glace à revoir
    Alors la demande est interdite

  Scénario: Le relecteur n'a aucun accès au dossier médical
    Étant donné que "relecteur-fictif-01" est connecté
    Quand "relecteur-fictif-01" demande l'accès au dossier "pat-fictif-001"
    Alors l'accès est refusé avec le motif "refus-role-sans-acces-clinique"
