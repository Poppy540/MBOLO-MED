# language: fr
# Données FICTIVES uniquement (numéros manifestement inventés). Règles : ADR-0021, principes n°3 et n°7.
@identite @recuperation @vague1
Fonctionnalité: Un patient sans e-mail retrouve son compte avec un code de l'équipe d'assistance
  Afin qu'un patient qui a oublié son mot de passe, et n'a pas d'e-mail, retrouve son compte et son dossier
  En tant que patient
  Je veux saisir, dans « Mot de passe oublié ? », le code que l'équipe d'assistance m'a dicté après
  m'avoir rappelé au numéro de mon dossier, puis choisir un nouveau mot de passe.

  Scénario: Code dicté par l'équipe, nouveau mot de passe, ancien refusé, patient prévenu par SMS
    Étant donné que "assistant-fictif-01" est connecté
    Et que la boîte des notifications simulées est relevée
    Et que "assistant-fictif-01" remet par téléphone un code de récupération pour "patient-fictif-05"
    Quand "patient-fictif-05" choisit un nouveau mot de passe avec ce code, depuis « Mot de passe oublié ? »
    Alors "patient-fictif-05" est connecté avec son nouveau mot de passe
    Et l’ancien mot de passe de "patient-fictif-05" ne fonctionne plus
    Et le numéro "+241 00 00 00 05" reçoit le message "le mot de passe de votre compte vient d’être changé"
    Quand "patient-fictif-05" saisit de nouveau ce code dans « Mot de passe oublié ? »
    Alors Keycloak indique "Code non reconnu"

  Scénario: L'équipe donne le code depuis l'espace d'assistance, après rappel, date de naissance et numéro
    Quand "assistant-fictif-01" ouvre l’espace d’assistance
    Et il retrouve le dossier du numéro d’assurance "FICTIF-pat-fictif-005"
    Alors l’espace d’assistance affiche le numéro de rappel "+241 00 00 00 05" et au moins 0 proche
    Quand il confirme avoir rappelé le patient qui veut retrouver son compte, avec la date "1990-01-01" et le numéro lu "FICTIF-pat-fictif-999"
    Alors l’espace d’assistance indique "Le numéro ne correspond pas"
    Quand il corrige le numéro lu en "FICTIF-pat-fictif-005"
    Alors l’espace d’assistance affiche un code à dicter, une seule fois
    Quand "patient-fictif-05" choisit un nouveau mot de passe avec ce code, depuis « Mot de passe oublié ? »
    Alors "patient-fictif-05" est connecté avec son nouveau mot de passe

  Scénario: Un code ne sert que pour le compte de son dossier
    Étant donné que "assistant-fictif-01" est connecté
    Et que "assistant-fictif-01" remet par téléphone un code de récupération pour "patient-fictif-05"
    Quand "patient-fictif-01" saisit de nouveau ce code dans « Mot de passe oublié ? »
    Alors Keycloak indique "Code non reconnu"
    Quand "patient-fictif-05" choisit un nouveau mot de passe avec ce code, depuis « Mot de passe oublié ? »
    Alors "patient-fictif-05" est connecté avec son nouveau mot de passe

  Scénario: Seule l'équipe d'assistance remet un code de récupération
    Étant donné que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" est connecté
    Quand "medecin-fictif-01" demande un code de récupération pour "patient-fictif-05"
    Alors la demande à l’assistance est refusée avec le statut 403
    Quand "patient-fictif-01" demande un code de récupération pour "patient-fictif-01"
    Alors la demande à l’assistance est refusée avec le statut 403
