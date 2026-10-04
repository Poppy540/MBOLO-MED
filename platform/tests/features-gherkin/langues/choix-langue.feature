# language: fr
# Données FICTIVES uniquement : « [FICTIF] Démo » est un catalogue de démonstration, pas une langue
# (ADR-0025). L'application est construite avec VITE_LANGUES qui le cite, comme en CI.
@langues @application
Fonctionnalité: Choix de la langue dans l'application patient
  Afin de lire l'application dans ma langue
  En tant que patient
  Je veux choisir ma langue dès le premier écran, avant de me connecter, et la retrouver ensuite.

  Scénario: Le patient choisit sa langue avant de se connecter, et l'application s'en souvient
    Étant donné que l’application patient est ouverte, sans connexion
    Alors l’accueil affiche "Se connecter" et la page est en "fr"
    Quand le patient choisit la langue "[FICTIF] Démo"
    Alors l’accueil affiche "[FICTIF] Se connecter" et la page est en "fr-x-fictif"
    Et un texte pas encore traduit reste en français : "J'ai un code d'invitation"
    Et l’écran de l’"application patient" respecte les règles d’accessibilité
    Quand le patient rouvre l’application
    Alors l’accueil affiche "[FICTIF] Se connecter" et la page est en "fr-x-fictif"
    Quand le patient choisit la langue "Français"
    Alors l’accueil affiche "Se connecter" et la page est en "fr"

  Scénario: La langue choisie avant la connexion est gardée dans le dossier, pour les SMS du patient
    Étant donné que l’application patient est ouverte, sans connexion
    Quand le patient choisit la langue "[FICTIF] Démo"
    Et que "patient-fictif-02" se connecte depuis cet écran
    Alors le dossier de "pat-fictif-002" indique la langue préférée "fr-x-fictif"
