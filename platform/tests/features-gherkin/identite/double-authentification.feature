# language: fr
# Données FICTIVES uniquement. Règle : ADR-0009 (MFA obligatoire pour les professionnels).
@identite @securite @mfa
Fonctionnalité: Double authentification des professionnels
  Afin de protéger l'accès aux dossiers médicaux contre le vol de mot de passe
  En tant que plateforme Mbolo Santé
  Je veux que les professionnels, infirmiers, pharmaciens et administrateurs
  ne puissent se connecter qu'avec un code à usage unique, sans l'imposer aux patients.

  Scénario: Un infirmier doit configurer la double authentification à sa première connexion
    Quand "infirmier-fictif-01" saisit seulement son identifiant et son mot de passe
    Alors un code de double authentification est exigé

  Scénario: Un médecin dont la double authentification est configurée doit saisir un code
    Étant donné que "medecin-fictif-01" est connecté
    Quand "medecin-fictif-01" saisit seulement son identifiant et son mot de passe
    Alors un code de double authentification est exigé

  Scénario: Un pharmacien ne se connecte pas avec son seul mot de passe
    Quand "pharmacien-fictif-01" saisit seulement son identifiant et son mot de passe
    Alors un code de double authentification est exigé

  Scénario: Un infirmier se connecte avec la double authentification
    Étant donné que "infirmier-fictif-01" est connecté
    Quand "infirmier-fictif-01" demande l'accès au dossier "pat-fictif-001"
    Alors l'accès est refusé avec le motif "refus-sans-consentement"

  Scénario: Un patient n'a pas de code à saisir
    Quand "patient-fictif-02" saisit seulement son identifiant et son mot de passe
    Alors aucun code de double authentification n'est exigé
