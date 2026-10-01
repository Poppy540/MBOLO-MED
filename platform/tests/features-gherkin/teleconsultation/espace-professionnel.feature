# language: fr
# Données FICTIVES uniquement ; micro et caméra simulés. Règles : ADR-0009 (MFA), ADR-0011.
@teleconsultation @vague1 @application
Fonctionnalité: Espace professionnel
  Afin d'organiser mes téléconsultations
  En tant que professionnel de santé
  Je veux publier et retirer mes créneaux, reporter un rendez-vous et rejoindre mes patients.

  Scénario: Le médecin publie des créneaux à l'heure du Gabon, puis en retire un
    Étant donné que "medecin-fictif-01" est connecté
    Quand "medecin-fictif-01" ouvre l’espace professionnel
    Et que le professionnel publie 2 créneaux de 20 minutes dans 7 jours à "10:00"
    Alors l’espace professionnel affiche un créneau libre dans 7 jours à "10:00"
    Et l’espace professionnel affiche un créneau libre dans 7 jours à "10:20"
    Et l’écran de l’"espace professionnel" respecte les règles d’accessibilité
    Quand le professionnel retire le créneau libre dans 7 jours à "10:20"
    Alors l’espace professionnel n’affiche plus de créneau dans 7 jours à "10:20"

  Scénario: Le médecin reporte un rendez-vous sur un de ses créneaux
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Quand "medecin-fictif-01" ouvre l’espace professionnel
    Et que le professionnel publie 1 créneaux de 30 minutes dans 8 jours à "15:30"
    Et que le professionnel reporte ce rendez-vous au créneau dans 8 jours à "15:30"
    Alors le dossier médical place ce rendez-vous dans 8 jours à "15:30", heure du Gabon

  Scénario: Le patient et le médecin se retrouvent chacun depuis son application
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Quand "patient-fictif-01" ouvre l’application patient pour "prac-fictif-001"
    Et que le patient rejoint ce rendez-vous dans l’application
    Et que "medecin-fictif-01" ouvre l’espace professionnel
    Et que le professionnel rejoint ce rendez-vous dans l’espace professionnel
    Alors l’espace professionnel indique que le patient est connecté
    Et l’application indique que le professionnel de santé est connecté

  Scénario: Sans partage du dossier, le médecin ne le voit pas, sauf accès d'urgence motivé
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Quand "medecin-fictif-01" ouvre l’espace professionnel
    Et que le professionnel ouvre le dossier de ce rendez-vous
    Alors l’espace professionnel indique que le dossier n’est pas partagé
    Quand le professionnel accède en urgence avec le motif "[FICTIF] Détresse respiratoire pendant la consultation"
    Alors l’espace professionnel affiche le dossier du patient
    Et l’espace professionnel signale un accès d’urgence

  Scénario: Avec le partage du dossier, le médecin rédige le compte-rendu de la consultation
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" donne son consentement "C-PARTAGE-PRO" à "Practitioner/prac-fictif-001"
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Quand "medecin-fictif-01" ouvre l’espace professionnel
    Et que le professionnel ouvre le dossier de ce rendez-vous
    Alors l’espace professionnel affiche le dossier du patient
    Quand le professionnel rédige le compte-rendu avec la conclusion "[FICTIF] Rhume simple, pas de signe de gravité"
    Alors le dossier médical contient ce compte-rendu, signé par "prac-fictif-001"
    Quand "patient-fictif-01" retire ce consentement
