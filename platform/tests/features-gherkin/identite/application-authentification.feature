# language: fr
# Données FICTIVES uniquement (numéros manifestement inventés, clés générées pour le test).
# Règles : ADR-0024 (application d'authentification en option, le SMS reste le choix par défaut).
@identite @securite @application-authentification @vague1
Fonctionnalité: Le patient protège son compte avec une application d'authentification
  Afin que le vol de ma carte SIM ne suffise pas à payer ni à partager mon dossier
  En tant que patient
  Je veux remplacer le code SMS par le code d'une application gratuite,
  et pouvoir revenir au SMS avec un code de cette application.

  Scénario: Sans code SMS dans cette connexion, aucune application ne peut être activée
    Quand "patient-fictif-07" demande à activer une application sans avoir confirmé par SMS
    Alors aucun code SMS n’a été envoyé à "patient-fictif-07"

  # Un seul scénario suit l'application du début à la fin : le compte est remis au SMS à chaque préparation.
  Scénario: Activée, l'application remplace le SMS ; retirée, les codes reviennent par SMS
    Étant donné que la boîte des notifications simulées est relevée
    Quand "patient-fictif-07" active une application d’authentification après un code SMS
    Alors le numéro "+241 00 00 00 07" reçoit le message "une application d’authentification vient d’être ajoutée à votre compte"
    Quand "patient-fictif-07" confirme une action sensible avec le code de son application
    Alors aucun code SMS n’a été envoyé à "patient-fictif-07"
    Quand "patient-fictif-07" saisit un code faux à la place de celui de son application
    Et "patient-fictif-07" retire son application avec un code de l’application
    Alors le numéro "+241 00 00 00 07" reçoit le message "l’application d’authentification de votre compte vient d’être retirée"
    Et Keycloak demande de nouveau un code par SMS à "patient-fictif-07"

  # Un voleur de mot de passe peut ajouter un code TOTP par l'action standard de Keycloak : seul
  # le justificatif désigné par l'extension compte, le SMS reste exigé.
  Scénario: Un code TOTP ajouté sans l'extension ne remplace pas le code SMS
    Quand "patient-fictif-07" ajoute un code TOTP par l’action standard de Keycloak, avec son seul mot de passe
    Alors Keycloak demande de nouveau un code par SMS à "patient-fictif-07"
