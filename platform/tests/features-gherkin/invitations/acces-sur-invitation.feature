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

  # Inscription (ADR-0014) : formulaire natif de Keycloak complété par l'extension Mbolo.
  Scénario: Une personne invitée crée son compte patient avec son code
    Étant donné que "gestionnaire-fictif-01" est connecté
    Et que "gestionnaire-fictif-01" crée une invitation pour la cohorte de test
    Quand une personne s'inscrit avec ce code
    Alors son compte est créé avec le seul rôle patient, sans nom ni e-mail dans le jeton
    Et son dossier est créé avec une identité à vérifier
    Et le code n'est pas reconnu

  Scénario: Un code déjà utilisé ne permet pas une seconde inscription
    Étant donné que "gestionnaire-fictif-01" est connecté
    Et que "gestionnaire-fictif-01" crée une invitation pour la cohorte de test
    Et qu'une personne s'inscrit avec ce code
    Quand une autre personne s'inscrit avec le même code
    Alors l'inscription est refusée avec le message « Code non reconnu »

  Scénario: Sans code valable, aucun compte n'est créé
    Quand une personne s'inscrit avec le code "ZZZZ-ZZZZ"
    Alors l'inscription est refusée avec le message « Code non reconnu »
    Et aucun compte n'est créé pour cette personne

  Scénario: Le formulaire d'inscription ne demande ni nom ni e-mail
    Quand une personne ouvre le formulaire d'inscription
    Alors le formulaire demande un code d'invitation, un identifiant et un mot de passe seulement

  Scénario: L'identité saisie après l'inscription est contrôlée avant de créer le dossier
    Étant donné que "gestionnaire-fictif-01" est connecté
    Et que "gestionnaire-fictif-01" crée une invitation pour la cohorte de test
    Quand une personne s'inscrit avec ce code en indiquant une naissance dans le futur
    Alors le formulaire d'identité signale la date de naissance

  Scénario: Un patient dont l'identité n'est pas vérifiée ne peut pas réserver
    Étant donné un créneau libre de "prac-fictif-001" est publié dans 6 jours
    Et que "patient-fictif-01" est connecté
    Quand "patient-fictif-01" tente de réserver ce créneau alors que son identité est à vérifier
    Alors la réservation est refusée car son identité n'est pas vérifiée
