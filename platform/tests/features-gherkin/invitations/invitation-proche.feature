# language: fr
# Données FICTIVES uniquement (numéros manifestement inventés). Règles : ADR-0019, principe n°3.
@invitations @proches @vague2
Fonctionnalité: Le patient invite un proche
  Afin qu'un proche, parfois à l'étranger, m'aide à suivre mon traitement
  En tant que patient
  Je veux inviter ce proche : il reçoit un code par SMS, et je peux annuler l'invitation.

  Scénario: Le patient invite un proche, qui reçoit son code par SMS ; le dossier ne garde que son prénom et le lien
    Étant donné que "patient-fictif-01" est connecté
    Et que "patient-fictif-01" n'a aucune invitation de proche en cours
    Et que la boîte des notifications simulées est relevée
    Quand "patient-fictif-01" invite son proche "Serge [FICTIF]", son enfant, au numéro "+33000000009"
    Alors l'invitation du proche est créée et le code envoyé par SMS
    Et le numéro "+33000000009" reçoit ce code, sans le nom du patient ni aucune donnée de santé
    Et le dossier contient la fiche inactive du proche, avec son prénom et le lien seulement
    Et le partage avec ce proche est actif dans le dossier
    Et le code du proche ne permet pas de créer un compte patient
    Quand "patient-fictif-01" annule cette invitation de proche
    Alors l'invitation du proche est "revoque"
    Et "patient-fictif-01" retire le partage avec ce proche

  Scénario: Trois proches au plus par patient
    Étant donné que "patient-fictif-01" est connecté
    Et que "patient-fictif-01" n'a aucune invitation de proche en cours
    Quand "patient-fictif-01" invite 3 proches
    Et que "patient-fictif-01" invite son proche "Paul [FICTIF]", son enfant, au numéro "+33000000009"
    Alors l'invitation du proche est refusée avec le statut 409
    Et "patient-fictif-01" annule toutes ses invitations de proches et retire ces partages

  Scénario: Seul un patient de la cohorte ouverte invite un proche
    Étant donné que "medecin-fictif-01" est connecté
    Et que "patient-fictif-02" est connecté
    Quand "medecin-fictif-01" invite son proche "Paul [FICTIF]", son enfant, au numéro "+33000000009"
    Alors l'invitation du proche est refusée avec le statut 403
    Quand "patient-fictif-02" invite son proche "Paul [FICTIF]", son enfant, au numéro "+33000000009"
    Alors l'invitation du proche est refusée avec le statut 403
    Quand une personne sans jeton invite un proche
    Alors l'invitation du proche est refusée avec le statut 401
