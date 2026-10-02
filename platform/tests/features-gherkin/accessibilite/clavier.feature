# language: fr
# Données FICTIVES uniquement. WCAG 2.1.1 (tout au clavier) et 2.4.7 (focus visible).
@accessibilite @vague1
Fonctionnalité: L'application patient se parcourt au clavier seul
  Afin de pouvoir utiliser Mbolo Santé sans souris ni écran tactile (clavier, contacteur, lecteur d'écran)
  En tant que patient
  Je veux atteindre et activer chaque bouton au clavier, en voyant toujours où je suis.

  Scénario: Le patient ouvre ses comptes-rendus puis revient à ses rendez-vous, au clavier seul
    Étant donné que "patient-fictif-01" est connecté
    Quand "patient-fictif-01" ouvre l’application patient
    Et que dans l’"application patient", la personne active "Mes comptes-rendus et ordonnances" au clavier
    Alors dans l’"application patient", le focus est sur le titre "Mes comptes-rendus et ordonnances"
    Quand dans l’"application patient", la personne active "Retour" au clavier
    Alors dans l’"application patient", le focus est sur le titre "Mes rendez-vous"
