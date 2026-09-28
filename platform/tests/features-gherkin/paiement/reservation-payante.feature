# language: fr
# Données FICTIVES uniquement : fournisseur de paiement simulé, numéro inventé. Règles : ADR-0017.
@paiement @vague1
Fonctionnalité: Réservation d'une téléconsultation payée par mobile money
  Afin que la consultation soit réglée avant d'avoir lieu
  En tant que patient
  Je veux que mon créneau soit retenu le temps de payer, puis confirmé dès que le paiement est reçu.

  Scénario: Le patient paie depuis son téléphone et le rendez-vous est confirmé
    Étant donné que "patient-fictif-04" est connecté
    Quand "patient-fictif-04" réserve un créneau avec "prac-fictif-001"
    Alors la réservation attend un paiement de 10000 "XAF"
    Et "patient-fictif-04" ne peut pas encore entrer dans la salle
    Quand "patient-fictif-04" paie avec "airtel" depuis le numéro "+241 00 00 00 00"
    Et que le payeur valide le paiement sur son téléphone
    Alors le rendez-vous de "patient-fictif-04" est confirmé
    Et le dossier médical contient ce rendez-vous au statut "booked"

  Scénario: Le payeur refuse, puis réessaie avec un autre opérateur
    Étant donné que "patient-fictif-04" est connecté
    Quand "patient-fictif-04" réserve un créneau avec "prac-fictif-001"
    Et que "patient-fictif-04" paie avec "airtel" depuis le numéro "+241 00 00 00 00"
    Et que le payeur refuse le paiement sur son téléphone
    Alors le rendez-vous de "patient-fictif-04" attend toujours son paiement
    Quand "patient-fictif-04" paie avec "moov" depuis le numéro "+241 00 00 00 00"
    Et que le payeur valide le paiement sur son téléphone
    Alors le rendez-vous de "patient-fictif-04" est confirmé

  Scénario: Sans paiement dans le délai, la plateforme annule la réservation et rend le créneau
    Étant donné que "patient-fictif-04" est connecté
    Quand "patient-fictif-04" réserve un créneau avec "prac-fictif-001"
    Et que le délai de paiement est dépassé
    Alors le dossier médical contient ce rendez-vous au statut "cancelled", annulé par "plateforme"
    Et "patient-fictif-04" voit ces créneaux libres chez "prac-fictif-001"

  Scénario: Personne d'autre ne peut payer ni voir le paiement d'un patient
    Étant donné que "patient-fictif-04" est connecté
    Et que "patient-fictif-01" est connecté
    Quand "patient-fictif-04" réserve un créneau avec "prac-fictif-001"
    Et que "patient-fictif-01" paie avec "airtel" depuis le numéro "+241 00 00 00 00"
    Alors le paiement est refusé car introuvable pour ce compte

  Scénario: Hors de la cohorte payante, la réservation est confirmée sans paiement
    Étant donné que "patient-fictif-01" est connecté
    Quand "patient-fictif-01" réserve un créneau avec "prac-fictif-001"
    Alors le rendez-vous est confirmé sans paiement
