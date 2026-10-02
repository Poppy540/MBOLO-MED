# language: fr
# Données FICTIVES uniquement. WCAG 2.1.1 (tout au clavier) et 2.4.7 (focus visible).
@accessibilite @vague1
Fonctionnalité: Les applications se parcourent au clavier seul
  Afin de pouvoir utiliser Mbolo Santé sans souris ni écran tactile (clavier, contacteur, lecteur d'écran)
  En tant que patient ou professionnel
  Je veux atteindre et activer chaque bouton au clavier, en voyant toujours où je suis.

  Scénario: Le patient ouvre ses comptes-rendus puis revient à ses rendez-vous, au clavier seul
    Étant donné que "patient-fictif-01" est connecté
    Quand "patient-fictif-01" ouvre l’application patient
    Et que dans l’"application patient", la personne active "Mes comptes-rendus et ordonnances" au clavier
    Alors dans l’"application patient", le focus est sur le titre "Mes comptes-rendus et ordonnances"
    Quand dans l’"application patient", la personne active "Retour" au clavier
    Alors dans l’"application patient", le focus est sur le titre "Mes rendez-vous"

  Scénario: Le médecin ouvre ses créneaux depuis le menu de l'espace professionnel, au clavier seul
    Étant donné que "medecin-fictif-01" est connecté
    Quand "medecin-fictif-01" ouvre l’espace professionnel
    Et que dans l’"espace professionnel", la personne active "Mes créneaux" au clavier
    Alors dans l’"espace professionnel", le focus est sur le titre "Publier des créneaux"
