# language: fr
# Jours 10 et 11 : aucun autre scénario n'y publie de créneau (l'espace professionnel publie à heure fixe
# aux jours 7 et 8 ; un créneau « maintenant + 7 jours » le chevauchait selon l'heure d'exécution).
# Données FICTIVES uniquement : fournisseur de paiement simulé, numéro inventé. Règles : ADR-0017.
@paiement @vague1 @application
Fonctionnalité: Payer et rembourser depuis les applications
  Afin de payer ma consultation depuis mon téléphone, même avec un réseau faible
  En tant que patient
  Je veux voir le montant, choisir mon opérateur et valider sur mon téléphone ;
  et, en tant que valideur, décider des remboursements depuis l'espace professionnel.

  Scénario: Le patient réserve et paie dans l'application, puis retrouve son rendez-vous confirmé
    Étant donné que "patient-fictif-04" est connecté
    Et un créneau libre de "prac-fictif-001" est publié dans 10 jours
    Quand "patient-fictif-04" ouvre l’application patient pour "prac-fictif-001"
    Et que le patient réserve ce créneau dans l’application
    Alors l’application demande de payer 10000 "XAF"
    Quand le patient paie avec "Moov Money" depuis le numéro "+241 00 00 00 00" dans l’application
    Alors l’application demande de valider le paiement sur le téléphone avec "Moov Money"
    Quand le payeur valide sur son téléphone le paiement de ce créneau
    Alors l’application confirme que le rendez-vous est payé
    Et le rendez-vous payé apparaît dans l’application, prêt à être rejoint

  Scénario: Le payeur refuse : l'application le dit et permet de réessayer
    Étant donné que "patient-fictif-04" est connecté
    Et un créneau libre de "prac-fictif-001" est publié dans 11 jours
    Quand "patient-fictif-04" ouvre l’application patient pour "prac-fictif-001"
    Et que le patient réserve ce créneau dans l’application
    Et que le patient paie avec "Airtel Money" depuis le numéro "+241 00 00 00 00" dans l’application
    Et que le payeur refuse sur son téléphone le paiement de ce créneau
    Alors l’application indique que le paiement n’a pas abouti et propose de réessayer

  Scénario: Le valideur rembourse depuis l'espace professionnel un rendez-vous payé puis annulé
    Étant donné que "patient-fictif-04" est connecté
    Quand "patient-fictif-04" réserve un créneau avec "prac-fictif-001"
    Et que "patient-fictif-04" paie avec "airtel" depuis le numéro "+241 00 00 00 00"
    Et que le payeur valide le paiement sur son téléphone
    Alors le rendez-vous de "patient-fictif-04" est confirmé
    Quand "patient-fictif-04" annule ce rendez-vous
    Alors le rendez-vous est annulé
    Et que "valideur-fictif-01" est connecté
    Quand "valideur-fictif-01" ouvre les remboursements à valider dans l’espace professionnel
    Et que le valideur valide le remboursement de ce rendez-vous
    Alors l’espace professionnel confirme que le remboursement est versé
