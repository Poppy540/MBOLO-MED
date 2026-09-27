# language: fr
# Données FICTIVES uniquement : comptes créés et détruits à chaque exécution (voir e2e-playwright).
@identite @securite
Fonctionnalité: Connexion sécurisée par Keycloak
  Afin de protéger l'accès aux dossiers médicaux
  En tant que plateforme Mbolo Santé
  Je veux que chaque connexion passe par Keycloak avec PKCE,
  et que le rattachement d'un compte à un dossier ne soit modifiable que par un administrateur.

  Scénario: Un patient se connecte et son jeton le rattache à son dossier
    Étant donné que "patient-fictif-01" est connecté
    Alors le jeton de "patient-fictif-01" le rattache au dossier "pat-fictif-001"

  Scénario: Une application qui ne présente pas de défi PKCE est refusée
    Quand l'application "patient" demande une connexion sans PKCE
    Alors Keycloak refuse la connexion avec l'erreur "invalid_request"

  Scénario: La connexion directe par mot de passe est désactivée
    Quand "patient-fictif-01" tente une connexion directe par mot de passe
    Alors Keycloak refuse la connexion avec l'erreur "unauthorized_client"

  Scénario: Un patient ne peut pas se rattacher lui-même au dossier d'un autre
    Étant donné que "patient-fictif-01" est connecté
    Quand "patient-fictif-01" tente de modifier lui-même son identifiant de dossier en "pat-fictif-002"
    Alors la modification est refusée
    Et le jeton de "patient-fictif-01" le rattache au dossier "pat-fictif-001"
