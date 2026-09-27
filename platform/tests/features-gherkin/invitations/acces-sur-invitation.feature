# language: fr
# Données FICTIVES uniquement. Règle : ADR-0013 (accès sur invitation, vague 1).
# Cohorte, quota et durée de validité sont des paramètres du déploiement (pays, vague).
@invitations @securite
Fonctionnalité: Accès sur invitation
  Afin d'ouvrir la plateforme à une population limitée pendant la vague 1
  En tant que gestionnaire des invitations habilité
  Je veux créer des codes à usage unique, les suivre et les révoquer,
  sans que le code soit jamais conservé en clair.

  Scénario: Le gestionnaire crée un code qu'un patient peut ensuite présenter
    Étant donné que "gestionnaire-fictif-01" est connecté
    Quand "gestionnaire-fictif-01" crée une invitation pour la cohorte de test
    Alors un code de 8 caractères lui est montré une seule fois
    Et le code est reconnu comme valable
    Et la liste des invitations de la cohorte contient l'invitation sans son code

  Scénario: Un code révoqué n'est plus reconnu
    Étant donné que "gestionnaire-fictif-01" est connecté
    Quand "gestionnaire-fictif-01" crée une invitation pour la cohorte de test
    Et que "gestionnaire-fictif-01" révoque cette invitation
    Alors le code n'est pas reconnu

  Scénario: Un code inventé n'est pas reconnu
    Quand quelqu'un présente le code "ZZZZ-ZZZZ"
    Alors le code n'est pas reconnu

  Scénario: Un médecin ne peut pas créer d'invitation
    Étant donné que "medecin-fictif-01" est connecté
    Quand "medecin-fictif-01" crée une invitation pour la cohorte de test
    Alors la demande est interdite

  Scénario: Le gestionnaire des invitations n'a aucun accès au dossier médical
    Étant donné que "gestionnaire-fictif-01" est connecté
    Quand "gestionnaire-fictif-01" demande l'accès au dossier "pat-fictif-001"
    Alors l'accès est refusé avec le motif "refus-role-sans-acces-clinique"
