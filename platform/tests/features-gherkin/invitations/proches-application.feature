# language: fr
# Données FICTIVES uniquement (numéros manifestement inventés). Règles : ADR-0019, principe n°3.
@invitations @proches @application @vague2
Fonctionnalité: Le patient invite et retire ses proches depuis son application
  Afin qu'un proche m'aide à suivre mon traitement, sans perdre la main sur mon dossier
  En tant que patient
  Je veux inviter un proche en quelques gestes, et pouvoir le retirer à tout moment.

  Scénario: Le patient invite un proche depuis l'application, puis le retire
    Étant donné que "patient-fictif-01" est connecté
    Et que "patient-fictif-01" n'a aucune invitation de proche en cours
    Et que la boîte des notifications simulées est relevée
    Quand "patient-fictif-01" ouvre l’application patient
    Et que le patient ouvre ses partages et accès
    Et que le patient demande à inviter un proche
    Et que le patient confirme avec le code reçu par SMS
    Et que le patient invite son proche "Serge [FICTIF]", son enfant, au numéro "+33 0 00 00 00 09" dans l’application
    Alors l’application confirme l’envoi du code par SMS et le montre en secours
    Et le numéro "+33000000009" reçoit ce code, sans le nom du patient ni aucune donnée de santé
    Et le partage avec ce proche est actif dans le dossier
    Et l’application liste "Serge [FICTIF]" avec une invitation en cours, et le partage à son nom
    Quand le patient retire ce proche dans l’application
    Alors l'invitation du proche est "revoque"
    Et la fiche du proche est inactive et le partage retiré

  Scénario: Un numéro sans indicatif international est refusé avant tout envoi
    Étant donné que "patient-fictif-01" est connecté
    Et que "patient-fictif-01" n'a aucune invitation de proche en cours
    Quand "patient-fictif-01" ouvre l’application patient
    Et que le patient ouvre ses partages et accès
    Et que le patient demande à inviter un proche
    Et que le patient confirme avec le code reçu par SMS
    Et que le patient invite son proche "Paul [FICTIF]", son enfant, au numéro "00 00 00 00" dans l’application
    Alors l’application demande un numéro au format international et n’invite personne
