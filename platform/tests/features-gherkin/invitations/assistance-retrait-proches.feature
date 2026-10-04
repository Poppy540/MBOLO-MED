# language: fr
# Données FICTIVES uniquement (numéros manifestement inventés). Règles : ADR-0019, principes n°3 et n°7.
@invitations @proches @assistance @vague2
Fonctionnalité: L'équipe d'assistance retire les proches d'un patient, à sa demande
  Afin qu'un patient qui ne peut pas utiliser son application (téléphone perdu, proche envahissant)
  puisse quand même retirer l'accès de ses proches
  En tant que membre de l'équipe d'assistance (rôle assistance-patient, jamais un agent IA)
  Je veux, après avoir rappelé le patient au numéro de son dossier et vérifié sa date de naissance,
  retirer tous ses proches, sans rien voir d'autre de son dossier.

  Scénario: Rappel au numéro du dossier, date de naissance vérifiée, tous les proches retirés
    Étant donné que "patient-fictif-01" est connecté
    Et que "patient-fictif-01" n'a aucune invitation de proche en cours
    Et que "patient-fictif-01" invite son proche "Serge [FICTIF]", son enfant, au numéro "+33000000009"
    Et que la boîte des notifications simulées est relevée
    Quand "assistant-fictif-01" ouvre l’espace d’assistance
    Et il retrouve le dossier du numéro d’assurance "FICTIF-pat-fictif-001"
    Alors l’espace d’assistance affiche le numéro de rappel "+241 00 00 00 01" et au moins 1 proche
    Et l’écran de l’"espace d’assistance" respecte les règles d’accessibilité
    Quand il confirme avoir rappelé le patient et saisit la date de naissance "1991-01-01"
    Alors l’espace d’assistance indique "La date de naissance ne correspond pas"
    Et l'invitation du proche est "valide"
    Quand il saisit de nouveau la date de naissance "1990-01-01"
    Alors l’espace d’assistance indique "retiré"
    Et l'invitation du proche est "revoque"
    Et la fiche du proche est inactive et le partage retiré
    Et le numéro "+241 00 00 00 01" reçoit le message "l’équipe a retiré l’accès de vos proches"
    Et l’espace d’assistance ne trouve plus aucun proche pour le numéro d’assurance "FICTIF-pat-fictif-001"
    Et l'historique des accès de "patient-fictif-01" montre l'intervention de l'équipe d'assistance

  Scénario: Seule l'équipe d'assistance retire les proches d'un patient
    Étant donné que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" est connecté
    Quand "medecin-fictif-01" cherche auprès de l’assistance le dossier du numéro d’assurance "FICTIF-pat-fictif-001"
    Alors la demande à l’assistance est refusée avec le statut 403
    Quand "patient-fictif-01" cherche auprès de l’assistance le dossier du numéro d’assurance "FICTIF-pat-fictif-001"
    Alors la demande à l’assistance est refusée avec le statut 403
    Quand "medecin-fictif-01" demande à identite le retrait des partages avec les proches de "patient-fictif-01"
    Alors la demande à l’assistance est refusée avec le statut 403
    Quand une personne sans jeton cherche auprès de l’assistance le dossier du numéro d’assurance "FICTIF-pat-fictif-001"
    Alors la demande à l’assistance est refusée avec le statut 401
