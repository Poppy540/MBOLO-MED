# language: fr
# Données FICTIVES uniquement (numéros manifestement inventés, photos générées). Règles : ADR-0023.
@identite @telephone-perdu @vague1
Fonctionnalité: Le patient qui a perdu son téléphone change de numéro
  Afin de continuer à recevoir mes codes et les appels de l'équipe après la perte de mon téléphone
  En tant que patient
  Je veux demander un nouveau numéro, prouvé par un code et de nouvelles photos,
  qu'une personne habilitée accepte après avoir vérifié que c'est bien moi.

  # Le refus passe d'abord : l'acceptation change le numéro (remis à chaque préparation).
  Scénario: Refusé : le numéro ne change pas
    Étant donné que la boîte des notifications simulées est relevée
    Et que "patient-fictif-06" est connecté
    Et que "patient-fictif-06" a accepté la charte de vérification d’identité à l’inscription
    Quand "patient-fictif-06" ouvre l’application patient
    Et que le patient choisit « J’ai perdu mon téléphone » et confirme le nouveau numéro "+241 00 00 00 26"
    Et qu'il envoie deux nouvelles photos depuis l’application
    Et que "verificateur-fictif-01" ouvre les changements de numéro dans l’espace professionnel
    Et que la vérificatrice ouvre la demande de "patient-fictif-06" et voit les deux nouvelles photos
    Et l’écran de l’"espace professionnel" respecte les règles d’accessibilité
    Et que la vérificatrice refuse la demande : « Le visage ne correspond pas »
    Alors le dossier de "patient-fictif-06" porte encore le numéro "+241 00 00 00 06"

  Scénario: Accepté : nouveau numéro noté « perte » (24 heures sans code), ancien numéro prévenu
    Étant donné que la boîte des notifications simulées est relevée
    Et que "patient-fictif-06" est connecté
    Et que "patient-fictif-06" a accepté la charte de vérification d’identité à l’inscription
    Quand "patient-fictif-06" ouvre l’application patient
    Et que le patient choisit « J’ai perdu mon téléphone » et confirme le nouveau numéro "+241 00 00 00 16"
    Et qu'il envoie deux nouvelles photos depuis l’application
    Alors le dossier de "patient-fictif-06" porte encore le numéro "+241 00 00 00 06"
    Quand "verificateur-fictif-01" ouvre les changements de numéro dans l’espace professionnel
    Et que la vérificatrice ouvre la demande de "patient-fictif-06" et voit les deux nouvelles photos
    Et que la vérificatrice accepte le nouveau numéro
    Alors le dossier de "patient-fictif-06" porte le numéro "+241 00 00 00 16", changé après une perte
    Et le numéro "+241 00 00 00 06" reçoit le message "le numéro de votre compte vient d’être changé"
    Et l'historique des accès de "patient-fictif-06" montre la consultation de ses photos
