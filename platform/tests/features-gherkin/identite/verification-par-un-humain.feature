# language: fr
# Données FICTIVES uniquement (photos générées, numéro inventé). Règles : ADR-0014, ADR-0015.
# La comparaison est faite à l'œil par une personne habilitée : aucune reconnaissance automatique.
@identite @documents @securite
Fonctionnalité: Vérification d'identité par une personne habilitée
  Afin qu'aucune consultation n'ait lieu sans identité vérifiée
  En tant que personne habilitée à vérifier les identités (double authentification)
  Je veux comparer les photos à l'identité déclarée et décider,
  chaque consultation des photos étant enregistrée dans le dossier du patient.

  Scénario: La vérificatrice confirme l'identité d'un patient depuis l'espace professionnel
    Étant donné que "patient-fictif-03" est connecté
    Et que "patient-fictif-03" a envoyé ses deux photos d'identité
    Quand "verificateur-fictif-01" ouvre les vérifications à faire dans l’espace professionnel
    Et que la vérificatrice ouvre le dossier de "patient-fictif-03" et voit ses deux photos
    Et que la vérificatrice confirme l'identité avec le numéro provisoire "FICTIF-PROV-0003"
    Alors le dossier de "patient-fictif-03" indique une identité vérifiée avec le numéro "FICTIF-PROV-0003"
    Et l'historique des accès de "patient-fictif-03" montre la consultation de ses photos

  Scénario: Photos à refaire : elles sont effacées et le patient peut en envoyer de nouvelles
    Étant donné que "patient-fictif-03" est connecté
    Et que "patient-fictif-03" a envoyé ses deux photos d'identité
    Et que "verificateur-fictif-01" est connecté
    Quand "verificateur-fictif-01" décide « a-refaire » pour "patient-fictif-03"
    Alors la décision est enregistrée
    Et "patient-fictif-03" n'a plus aucune photo envoyée et son identité reste à vérifier

  Scénario: Un refus exige un motif de la liste
    Étant donné que "patient-fictif-03" est connecté
    Et que "patient-fictif-03" a envoyé ses deux photos d'identité
    Et que "verificateur-fictif-01" est connecté
    Quand "verificateur-fictif-01" décide « refusee » pour "patient-fictif-03"
    Alors la décision est refusée avec le statut 422

  Scénario: Un médecin ne voit pas les vérifications à faire
    Étant donné que "medecin-fictif-01" est connecté
    Quand "medecin-fictif-01" demande les vérifications à faire
    Alors la demande de vérifications est interdite
