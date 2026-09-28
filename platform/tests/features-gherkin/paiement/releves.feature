# language: fr
# Données FICTIVES uniquement : fournisseur de paiement simulé, numéro inventé. Règles : ADR-0020.
@paiement @releves @vague1
Fonctionnalité: Relevés mensuels des professionnels
  Afin de préparer les reversements aux professionnels, sans rien verser automatiquement
  En tant que personne habilitée à valider les reversements
  Je veux voir, par professionnel et par mois, les consultations payées, les remboursements et la part à reverser.

  Scénario: Une consultation payée apparaît dans le relevé du mois de son professionnel
    Étant donné que "patient-fictif-04" est connecté
    Et que "reversements-fictif-01" est connecté
    Quand "patient-fictif-04" réserve un créneau avec "prac-fictif-001"
    Et que "patient-fictif-04" paie avec "airtel" depuis le numéro "+241 00 00 00 00"
    Et que le payeur valide le paiement sur son téléphone
    Alors le rendez-vous de "patient-fictif-04" est confirmé
    Et "reversements-fictif-01" voit dans le relevé du mois de "prac-fictif-001" au moins 1 consultation payée, avec 55 % à reverser

  Scénario: Seule la personne habilitée lit les relevés
    Étant donné que "valideur-fictif-01" est connecté
    Et que "patient-fictif-04" est connecté
    Quand "valideur-fictif-01" consulte le relevé du mois
    Alors la consultation du relevé est refusée avec le statut 403
    Quand "patient-fictif-04" consulte le relevé du mois
    Alors la consultation du relevé est refusée avec le statut 403
