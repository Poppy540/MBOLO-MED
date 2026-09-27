# language: fr
# Données FICTIVES uniquement ; micro et caméra simulés. Règles : ADR-0002, ADR-0011.
@teleconsultation @vague1 @application
Fonctionnalité: Application patient
  Afin de consulter un médecin depuis mon téléphone, même avec un réseau faible
  En tant que patient
  Je veux me connecter, choisir un créneau, voir mes rendez-vous et rejoindre la consultation.

  Scénario: Le patient se connecte, réserve un créneau puis l'annule
    Étant donné un créneau libre de "prac-fictif-001" est publié dans 6 jours
    Quand "patient-fictif-01" ouvre l’application patient pour "prac-fictif-001"
    Et que le patient réserve ce créneau dans l’application
    Alors l’application confirme le rendez-vous
    Quand le patient annule ce rendez-vous dans l’application
    Alors le rendez-vous disparaît de l’application

  Scénario: Le patient rejoint la consultation depuis l'application et passe en audio seulement
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Quand "patient-fictif-01" ouvre l’application patient pour "prac-fictif-001"
    Et que le patient rejoint ce rendez-vous dans l’application
    Et que "medecin-fictif-01" rejoint la téléconsultation
    Alors l’application indique que le professionnel de santé est connecté
    Quand le patient passe en audio seulement
    Alors l’application ne reçoit plus que le son

  Scénario: Sans réseau, le patient retrouve ses rendez-vous déjà connus
    Étant donné que "patient-fictif-01" est connecté
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Quand "patient-fictif-01" ouvre l’application patient pour "prac-fictif-001"
    Alors l’application affiche ce rendez-vous
    Quand le téléphone du patient perd le réseau et rouvre l’application
    Alors l’application affiche sans réseau les rendez-vous connus

  Scénario: Sans lien, le patient choisit son médecin dans l'annuaire
    Étant donné un créneau libre de "prac-fictif-001" est publié dans 9 jours
    Quand "patient-fictif-01" ouvre l’application patient
    Et que le patient choisit "prac-fictif-001" dans l’annuaire
    Et que le patient réserve ce créneau
    Alors l’application confirme le rendez-vous

  Scénario: Une personne invitée crée son compte depuis l'application et attend la vérification de son identité
    Étant donné que "gestionnaire-fictif-01" est connecté
    Et que "gestionnaire-fictif-01" crée une invitation pour la cohorte de test
    Quand une personne s'inscrit avec ce code depuis l'application patient
    Alors l'application indique que son identité doit être vérifiée avant toute consultation
