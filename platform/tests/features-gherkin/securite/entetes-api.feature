# language: fr
# Données FICTIVES uniquement. Règles : revue ASVS n°1 (docs/securite/asvs-matrice.md, C1).
@securite @asvs
Fonctionnalité: Aucune réponse d'API n'est gardée en cache
  Afin qu'aucune donnée de santé ne reste dans un cache (navigateur partagé, proxy)
  En tant que responsable de la sécurité
  Je veux que chaque service réponde avec « no-store » et « nosniff », même en cas d'erreur.

  Scénario: Les réponses personnelles des services portent les en-têtes de sécurité
    Étant donné que "patient-fictif-01" est connecté
    Alors les réponses de "patient-fictif-01" à ces adresses interdisent le cache et la devinette du type :
      | service          | chemin                            |
      | consultation     | /mes-documents                    |
      | identite         | /patients/pat-fictif-001/acces    |
      | teleconsultation | /rendez-vous                      |
      | invitations      | /proches                          |
      | paiement         | /recus                            |
      | notifications    | /sante                            |
      | documents        | /verification                     |
    Et une réponse d’erreur sans jeton de "consultation" interdit aussi le cache
