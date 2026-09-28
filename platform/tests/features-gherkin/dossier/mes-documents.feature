# language: fr
# Données FICTIVES uniquement. Principes n°1 (texte du professionnel, jamais d'une IA) et n°3 (lecture tracée).
@dossier @vague1
Fonctionnalité: Le patient lit ses comptes-rendus et ses ordonnances
  Afin de savoir ce que le médecin a conclu et quel traitement suivre
  En tant que patient
  Je veux retrouver dans mon application mes comptes-rendus et mes ordonnances, à jour.

  Scénario: Le patient retrouve le compte-rendu et l'ordonnance de sa consultation, puis voit l'annulation
    Étant donné que "patient-fictif-01" est connecté
    Et que "medecin-fictif-01" est connecté
    Et que "patient-fictif-01" donne son consentement "C-PARTAGE-PRO" à "Practitioner/prac-fictif-001"
    Et que "patient-fictif-01" demande un rendez-vous vidéo avec "prac-fictif-001" maintenant
    Et que "medecin-fictif-01" rédige le compte-rendu de ce rendez-vous
    Et que "medecin-fictif-01" prescrit du paracétamol 500 mg 3 fois par jour pendant 5 jours pour ce rendez-vous
    Quand "patient-fictif-01" ouvre l’application patient
    Et que le patient ouvre ses comptes-rendus et ordonnances
    Alors l’application affiche ce compte-rendu, tel que le médecin l’a écrit
    Et l’application affiche cette ordonnance, valable
    Quand "medecin-fictif-01" révoque cette ordonnance
    Et que le patient ouvre ses comptes-rendus et ordonnances
    Alors l’application indique que cette ordonnance est annulée par le médecin
    Quand "patient-fictif-01" retire ce consentement

  Scénario: La lecture de ses documents par le patient est tracée dans son dossier
    Étant donné que "patient-fictif-01" est connecté
    Quand "patient-fictif-01" demande ses comptes-rendus et ordonnances
    Alors ses documents lui sont remis
    Quand "patient-fictif-01" consulte l'historique des accès au dossier "pat-fictif-001"
    Alors l'historique contient une lecture du patient lui-même

  Scénario: Personne d'autre que le patient ne lit ses documents par ce chemin
    Étant donné que "medecin-fictif-01" est connecté
    Quand "medecin-fictif-01" demande ses comptes-rendus et ordonnances
    Alors la lecture des documents est refusée
    Quand une personne sans jeton demande des comptes-rendus et ordonnances
    Alors la lecture des documents est refusée
