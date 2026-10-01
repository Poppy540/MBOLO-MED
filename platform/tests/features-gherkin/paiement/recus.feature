# language: fr
# Données FICTIVES uniquement : fournisseur de paiement simulé, numéro inventé. Règles : ADR-0020.
@paiement @recus @vague1 @application
Fonctionnalité: Reçus et avoirs du patient
  Afin de garder une preuve de ce que j'ai payé et de ce qui m'a été remboursé
  En tant que patient
  Je veux un reçu numéroté à chaque paiement et un avoir à chaque remboursement, sans donnée de santé.

  Scénario: Un reçu après le paiement, puis un avoir après le remboursement validé
    Étant donné que "patient-fictif-04" est connecté
    Et que "valideur-fictif-01" est connecté
    Quand "patient-fictif-04" réserve un créneau avec "prac-fictif-001"
    Et que "patient-fictif-04" paie avec "airtel" depuis le numéro "+241 00 00 00 00"
    Et que le payeur valide le paiement sur son téléphone
    Alors le rendez-vous de "patient-fictif-04" est confirmé
    Et "patient-fictif-04" a un reçu de 10000 "XAF" pour ce rendez-vous, sans son numéro de téléphone
    Quand "patient-fictif-04" annule ce rendez-vous
    Et que "valideur-fictif-01" valide ce remboursement
    Alors le remboursement est effectué
    Et "patient-fictif-04" a un avoir de 10000 "XAF" qui annule ce reçu

  Scénario: Le patient retrouve son reçu dans l'application
    Étant donné que "patient-fictif-04" est connecté
    Quand "patient-fictif-04" réserve un créneau avec "prac-fictif-001"
    Et que "patient-fictif-04" paie avec "airtel" depuis le numéro "+241 00 00 00 00"
    Et que le payeur valide le paiement sur son téléphone
    Alors "patient-fictif-04" a un reçu de 10000 "XAF" pour ce rendez-vous, sans son numéro de téléphone
    Quand "patient-fictif-04" ouvre l’application patient
    Et que le patient ouvre ses reçus dans l’application
    Alors l’application affiche ce reçu de 10000 "XAF", sans valeur fiscale ni numéro de téléphone
    Et l’écran de l’"application patient" respecte les règles d’accessibilité

  Scénario: Les reçus ne sont montrés qu'aux patients de la cohorte ouverte, jamais à un professionnel
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Quand "patient-fictif-01" consulte ses reçus
    Alors la consultation des reçus est refusée avec le statut 403
    Quand "medecin-fictif-01" consulte ses reçus
    Alors la consultation des reçus est refusée avec le statut 403
