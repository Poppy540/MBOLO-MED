# language: fr
# Données FICTIVES uniquement (numéros manifestement inventés). Règles : ADR-0022, revue ASVS n°1 (D1).
@identite @double-authentification @vague1
Fonctionnalité: Un code reçu par SMS protège les actions sensibles du patient
  Afin qu'un mot de passe volé ne suffise pas pour payer, partager son dossier ou inviter un proche
  En tant que patient
  Je veux confirmer mon identité par un code reçu au numéro de mon dossier, juste avant ces actions,
  sans avoir de code à saisir pour me connecter chaque jour.

  Scénario: Le patient confirme son identité par le code reçu au numéro de son dossier
    Étant donné que la boîte des notifications simulées est relevée
    Quand "patient-fictif-02" se connecte, puis l’application demande une confirmation par SMS
    Alors Keycloak demande le code reçu par SMS
    Et le numéro "+241 00 00 00 01" reçoit le message "Il expire dans 5 minutes. Ne le donnez à personne, même pas à l’équipe."
    Quand le patient saisit le code reçu
    Alors le jeton de "patient-fictif-02" est de niveau 2

  Scénario: Trois codes faux, et le code reçu ne sert plus
    Étant donné que la boîte des notifications simulées est relevée
    Quand "patient-fictif-02" se connecte, puis l’application demande une confirmation par SMS
    Et le patient saisit trois fois un code faux
    Alors la page du code affiche "Trop d'essais. Demandez un nouveau code."
    Quand le patient saisit le code reçu
    Alors la page du code affiche "Demandez un nouveau code."

  Scénario: Sans action sensible, la connexion se fait avec le mot de passe seul
    Étant donné que la boîte des notifications simulées est relevée
    Quand "patient-fictif-02" est connecté
    Alors le jeton de "patient-fictif-02" est de niveau 1
    Et le numéro "+241 00 00 00 01" ne reçoit aucun message
