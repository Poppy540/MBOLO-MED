# language: fr
# Données FICTIVES uniquement. Règles : ADR-0026 (recrutement et vérification des professionnels).
@professionnels @vague1
Fonctionnalité: L'équipe de recrutement invite un professionnel de santé
  Afin que seuls des professionnels invités, puis vérifiés par une personne habilitée, consultent
  En tant que membre de l'équipe de recrutement
  Je veux remettre un code à usage unique au candidat, qui crée un compte d'attente sans accès aux patients.

  Scénario: Le candidat crée son compte avec son code : rôle d'attente, fiche inactive, aucun accès aux patients
    Étant donné que "recruteur-fictif-01" est connecté
    Quand "recruteur-fictif-01" invite le professionnel "Fictif" "Candidate"
    Alors le code est créé et la fiche du candidat est inactive, à vérifier, dans le dossier
    Quand le candidat crée son compte avec ce code et configure la double authentification
    Alors son compte a le seul rôle professionnel-candidat, rattaché à sa fiche, avec la double authentification
    Et l'invitation du professionnel est "utilise" pour "recruteur-fictif-01"
    Et le candidat ne peut pas publier de créneaux
    Et "patient-fictif-01" est connecté
    Et l'annuaire de "patient-fictif-01" ne montre pas ce candidat
    Et le candidat ne peut déposer aucune pièce avant d'accepter la charte
    Quand le candidat accepte la charte de vérification et dépose la photo de son diplôme
    Alors son dossier de candidature montre la charte acceptée et son diplôme, sans le contenu
    Quand le candidat déclare sa spécialité, son inscription à l'Ordre et ses langues de consultation
    Alors sa fiche porte sa déclaration, toujours inactive et à vérifier, sans période de validité
    Et le candidat ne peut pas déclarer une spécialité hors de la liste

  Scénario: Un code de professionnel révoqué ne permet plus de créer de compte
    Étant donné que "recruteur-fictif-01" est connecté
    Et que "recruteur-fictif-01" invite le professionnel "Fictif" "Revoque"
    Quand "recruteur-fictif-01" révoque l'invitation du professionnel
    Et qu'une personne s'inscrit avec ce code
    Alors l'inscription est refusée avec le message « Code non reconnu »

  Scénario: Seule l'équipe de recrutement invite un professionnel
    Étant donné que "medecin-fictif-01" est connecté
    Et que "gestionnaire-fictif-01" est connecté
    Quand "medecin-fictif-01" invite le professionnel "Fictif" "Refuse"
    Alors l'invitation du professionnel est refusée avec le statut 403
    Quand "gestionnaire-fictif-01" invite le professionnel "Fictif" "Refuse"
    Alors l'invitation du professionnel est refusée avec le statut 403
    Quand une personne sans jeton invite un professionnel
    Alors l'invitation du professionnel est refusée avec le statut 401
    Et le dossier de candidature est refusé à "medecin-fictif-01"
