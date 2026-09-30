# language: fr
# Données FICTIVES uniquement (numéros manifestement inventés). Règles : ADR-0023.
@identite @changement-numero @vague1
Fonctionnalité: Le patient change le numéro de son dossier
  Afin de continuer à recevoir mes codes et les appels de l'équipe quand je change de puce
  En tant que patient
  Je veux changer mon numéro moi-même, avec un code reçu à l'ancien puis au nouveau numéro,
  sans qu'un voleur de mot de passe puisse le faire à ma place.

  Scénario: Changement confirmé par les deux numéros ; l'ancien numéro est prévenu
    Étant donné que "gestionnaire-fictif-01" est connecté
    Et que "gestionnaire-fictif-01" crée une invitation pour la cohorte de test
    Et qu'une personne s'inscrit avec ce code
    Et que la boîte des notifications simulées est relevée
    Quand la personne inscrite demande à changer son numéro
    Et qu'elle confirme avec le code reçu à son ancien numéro, puis indique le nouveau numéro "+241 00 00 00 07"
    Et qu'elle confirme avec le code reçu au nouveau numéro "+241 00 00 00 07"
    Alors l’application apprend que le numéro est "changé"
    Et son dossier porte le numéro "+241 00 00 00 07"
    Et son dossier note un changement de numéro fait par le patient
    Et le numéro "+241 00 00 00 04" reçoit le message "le numéro de votre compte vient d’être changé"
    Quand la personne inscrite demande à changer son numéro
    Alors Keycloak refuse un second changement de numéro le même jour

  Scénario: Sans aller au bout, le numéro ne change pas
    Étant donné que "gestionnaire-fictif-01" est connecté
    Et que "gestionnaire-fictif-01" crée une invitation pour la cohorte de test
    Et qu'une personne s'inscrit avec ce code
    Et que la boîte des notifications simulées est relevée
    Quand la personne inscrite demande à changer son numéro
    Et qu'elle renonce au changement de numéro
    Alors l’application apprend que le numéro est "inchangé"
    Et son dossier porte le numéro "+241 00 00 00 04"

  Scénario: Depuis l'application patient, le patient voit le résultat du changement
    Étant donné que "gestionnaire-fictif-01" est connecté
    Et que "gestionnaire-fictif-01" crée une invitation pour la cohorte de test
    Et qu'une personne s'inscrit avec ce code
    Et que la boîte des notifications simulées est relevée
    Quand la personne inscrite choisit « Changer mon numéro » dans l’application
    Et qu'elle confirme avec le code reçu à son ancien numéro, puis indique le nouveau numéro "+241 00 00 00 08"
    Et qu'elle confirme avec le code reçu au nouveau numéro "+241 00 00 00 08"
    Alors l’application patient affiche le message "Votre numéro est changé. Les prochains codes arriveront à ce numéro."
    Et son dossier porte le numéro "+241 00 00 00 08"

  Scénario: Dans les 24 heures qui suivent une perte du téléphone, aucun code n'est envoyé
    Étant donné que "gestionnaire-fictif-01" est connecté
    Et que "gestionnaire-fictif-01" crée une invitation pour la cohorte de test
    Et qu'une personne s'inscrit avec ce code
    Et que le numéro de son dossier a été changé après une perte il y a 2 heures
    Quand la personne inscrite demande à changer son numéro
    Alors Keycloak explique qu’aucun code n’est envoyé pendant 24 heures
    Et aucun code n’est envoyé au numéro "+241 00 00 00 04"

  Scénario: Passé 24 heures après une perte, les codes reprennent
    Étant donné que "gestionnaire-fictif-01" est connecté
    Et que "gestionnaire-fictif-01" crée une invitation pour la cohorte de test
    Et qu'une personne s'inscrit avec ce code
    Et que le numéro de son dossier a été changé après une perte il y a 25 heures
    Quand la personne inscrite demande à changer son numéro
    Alors un code arrive au numéro "+241 00 00 00 04"
