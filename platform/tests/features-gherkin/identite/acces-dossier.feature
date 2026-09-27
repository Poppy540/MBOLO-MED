# language: fr
# Données FICTIVES uniquement. Règles : ADR-0009 et platform/services/identite/README.md.
@identite @consentement
Fonctionnalité: Accès au dossier d'un patient selon ses consentements
  Afin que le patient décide qui consulte son dossier (principe n°3)
  En tant que patient
  Je veux que l'accès soit refusé par défaut, accordé sur mon consentement, et retiré dès que je le révoque.

  Scénario: Le patient consulte son propre dossier
    Étant donné que "patient-fictif-01" est connecté
    Quand "patient-fictif-01" demande l'accès au dossier "pat-fictif-001"
    Alors l'accès est accordé avec le motif "patient-lui-meme"

  Scénario: Un patient ne peut pas consulter le dossier d'un autre patient
    Étant donné que "patient-fictif-01" est connecté
    Quand "patient-fictif-01" demande l'accès au dossier "pat-fictif-002"
    Alors l'accès est refusé avec le motif "refus-par-defaut"

  Scénario: Un médecin accède au dossier seulement pendant que le partage est consenti
    Étant donné que "patient-fictif-02" est connecté
    Et que "medecin-fictif-01" est connecté
    Quand "medecin-fictif-01" demande l'accès au dossier "pat-fictif-002"
    Alors l'accès est refusé avec le motif "refus-sans-consentement"
    Quand "patient-fictif-02" donne son consentement "C-PARTAGE-PRO" à "Practitioner/prac-fictif-001"
    Alors le dossier médical contient ce consentement avec le statut "active"
    Quand "medecin-fictif-01" demande l'accès au dossier "pat-fictif-002"
    Alors l'accès est accordé avec le motif "consentement-partage-pro"
    Quand "patient-fictif-02" retire ce consentement
    Alors le dossier médical contient ce consentement avec le statut "inactive"
    Quand "medecin-fictif-01" demande l'accès au dossier "pat-fictif-002"
    Alors l'accès est refusé avec le motif "refus-sans-consentement"

  Scénario: Un proche de la diaspora accède au dossier seulement avec un consentement qui le désigne
    Étant donné que "patient-fictif-01" est connecté
    Et que "proche-fictif-01" est connecté
    Quand "proche-fictif-01" demande l'accès au dossier "pat-fictif-001"
    Alors l'accès est refusé avec le motif "refus-sans-consentement"
    Quand "patient-fictif-01" donne son consentement "C-PROCHE" à "RelatedPerson/rp-fictif-001"
    Et que "proche-fictif-01" demande l'accès au dossier "pat-fictif-001"
    Alors l'accès est accordé avec le motif "consentement-proche"
    Quand "patient-fictif-01" retire ce consentement
    Et que "proche-fictif-01" demande l'accès au dossier "pat-fictif-001"
    Alors l'accès est refusé avec le motif "refus-sans-consentement"

  Scénario: Le partage avec un proche n'est proposé qu'aux patients de la cohorte activée
    Étant donné que "patient-fictif-02" est connecté
    Quand "patient-fictif-02" tente de donner son consentement "C-PROCHE" à "RelatedPerson/rp-fictif-001"
    Alors la fonction n'est pas encore disponible pour ce patient

  Scénario: Un partage avec un professionnel inconnu du dossier est refusé
    Étant donné que "patient-fictif-01" est connecté
    Quand "patient-fictif-01" tente de donner son consentement "C-PARTAGE-PRO" à "Practitioner/prac-inconnu-999"
    Alors le consentement est refusé par le dossier médical

  Scénario: Accès d'urgence (bris de glace) motivé : accordé, signalé pour revue humaine et visible du patient
    Étant donné que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" est connecté
    Quand "medecin-fictif-01" demande l'accès au dossier "pat-fictif-001" en urgence avec le motif "Patient inconscient aux urgences [FICTIF]"
    Alors l'accès est accordé avec le motif "bris-de-glace"
    Et une revue humaine est demandée
    Quand "patient-fictif-01" consulte l'historique des accès au dossier "pat-fictif-001"
    Alors l'historique contient un accès en urgence justifié par "Patient inconscient aux urgences [FICTIF]"

  Scénario: Les accès refusés sont aussi tracés dans le dossier du patient
    Étant donné que "medecin-fictif-01" est connecté
    Et que "patient-fictif-02" est connecté
    Quand "medecin-fictif-01" demande l'accès au dossier "pat-fictif-002"
    Et que "patient-fictif-02" consulte l'historique des accès au dossier "pat-fictif-002"
    Alors l'historique contient un accès refusé pour le motif "refus-sans-consentement"

  Scénario: Un médecin ne peut pas lire l'historique des accès d'un patient
    Étant donné que "medecin-fictif-01" est connecté
    Quand "medecin-fictif-01" consulte l'historique des accès au dossier "pat-fictif-001"
    Alors la demande est interdite

  Scénario: Bris de glace sans motif suffisant : refusé
    Étant donné que "medecin-fictif-01" est connecté
    Quand "medecin-fictif-01" demande l'accès au dossier "pat-fictif-001" en urgence avec le motif "urgent"
    Alors l'accès est refusé avec le motif "refus-bris-de-glace-sans-motif"
    Et aucune revue humaine n'est demandée

  Scénario: Un pharmacien n'a aucun accès clinique au dossier
    Étant donné que "pharmacien-fictif-01" est connecté
    Quand "pharmacien-fictif-01" demande l'accès au dossier "pat-fictif-001"
    Alors l'accès est refusé avec le motif "refus-role-sans-acces-clinique"

  Scénario: Un médecin ne peut pas lire les consentements d'un patient
    Étant donné que "medecin-fictif-01" est connecté
    Quand "medecin-fictif-01" tente de lire les consentements du dossier "pat-fictif-001"
    Alors la demande est interdite

  Scénario: Une demande sans jeton est rejetée
    Quand une demande d'accès au dossier "pat-fictif-001" arrive sans jeton
    Alors la demande est rejetée faute d'authentification

  Scénario: Un jeton modifié pour viser un autre dossier est rejeté
    Étant donné que "patient-fictif-01" est connecté
    Quand une demande d'accès au dossier "pat-fictif-002" arrive avec le jeton altéré de "patient-fictif-01"
    Alors la demande est rejetée faute d'authentification
