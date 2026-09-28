# language: fr
# Données FICTIVES uniquement : fournisseur de paiement simulé, numéro inventé. Règles : ADR-0017.
@paiement @vague1
Fonctionnalité: Remboursement d'un rendez-vous payé puis annulé, validé par un humain
  Afin que personne ne paie une consultation qui n'a pas lieu
  En tant que valideur des remboursements
  Je veux décider moi-même de chaque remboursement préparé par la plateforme.

  Scénario: Le patient annule un rendez-vous payé, le valideur valide et le remboursement est versé
    Étant donné que "patient-fictif-04" est connecté
    Et que "valideur-fictif-01" est connecté
    Quand "patient-fictif-04" réserve un créneau avec "prac-fictif-001"
    Et que "patient-fictif-04" paie avec "airtel" depuis le numéro "+241 00 00 00 00"
    Et que le payeur valide le paiement sur son téléphone
    Alors le rendez-vous de "patient-fictif-04" est confirmé
    Quand "patient-fictif-04" annule ce rendez-vous
    Alors "valideur-fictif-01" voit un remboursement de 10000 "XAF" à valider pour ce rendez-vous
    Quand "valideur-fictif-01" valide ce remboursement
    Alors le remboursement est effectué
    Et "valideur-fictif-01" ne voit plus ce remboursement à valider

  Scénario: Le valideur refuse : rien n'est versé
    Étant donné que "patient-fictif-04" est connecté
    Et que "valideur-fictif-01" est connecté
    Quand "patient-fictif-04" réserve un créneau avec "prac-fictif-001"
    Et que "patient-fictif-04" paie avec "airtel" depuis le numéro "+241 00 00 00 00"
    Et que le payeur valide le paiement sur son téléphone
    Et que "patient-fictif-04" annule ce rendez-vous
    Et que "valideur-fictif-01" refuse ce remboursement
    Alors le remboursement est refusé

  Scénario: Seul un valideur habilité décide d'un remboursement
    Étant donné que "patient-fictif-04" est connecté
    Et que "medecin-fictif-01" est connecté
    Et que "valideur-fictif-01" est connecté
    Quand "patient-fictif-04" réserve un créneau avec "prac-fictif-001"
    Et que "patient-fictif-04" paie avec "airtel" depuis le numéro "+241 00 00 00 00"
    Et que le payeur valide le paiement sur son téléphone
    Et que "patient-fictif-04" annule ce rendez-vous
    Alors "valideur-fictif-01" voit un remboursement de 10000 "XAF" à valider pour ce rendez-vous
    Quand "patient-fictif-04" valide ce remboursement
    Alors la décision de remboursement est refusée
    Quand "medecin-fictif-01" valide ce remboursement
    Alors la décision de remboursement est refusée
    Et "medecin-fictif-01" ne peut pas voir les remboursements à valider

  Scénario: Un rendez-vous annulé avant paiement ne peut plus être payé
    Étant donné que "patient-fictif-04" est connecté
    Quand "patient-fictif-04" réserve un créneau avec "prac-fictif-001"
    Et que "patient-fictif-04" annule ce rendez-vous
    Et que "patient-fictif-04" paie avec "airtel" depuis le numéro "+241 00 00 00 00"
    Alors le paiement est refusé car le rendez-vous est annulé
