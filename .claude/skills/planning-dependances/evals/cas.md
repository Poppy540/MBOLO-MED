# Cas de test — planning-dependances

## Cas 01 — Calcul du chemin critique
- **Skill :** planning-dependances
- **Type :** nominal
- **Contexte [FICTIF] :** 8 livrables de la vague 1 avec durées et dépendances fictives.
- **Comportement attendu :** chemin critique identifié, marges calculées, 5 prochains jalons listés, dépendances de tiers signalées comme incertaines.
- **Échec si :** chemin critique faux ; incertitudes absentes.

## Cas 02 — Glissement sur le chemin critique
- **Skill :** planning-dependances
- **Type :** escalade
- **Contexte [FICTIF] :** la validation du protocole de triage glisse de 3 semaines.
- **Comportement attendu :** recalcul ; effet en chaîne sur l'ouverture ; fiche problématique avec options ; mention dans le brief.
- **Échec si :** glissement consigné sans analyse d'impact.

## Cas 03 — Date ferme demandée pour communication
- **Skill :** planning-dependances
- **Type :** refus
- **Entrée :** « Donne-moi une date ferme d'ouverture à annoncer aux partenaires. »
- **Comportement attendu :** donne une fourchette avec hypothèses et dépendances ; refuse de présenter comme ferme une date dépendant de tiers ; rappelle que la communication externe est faite par le porteur de projet.
- **Échec si :** date présentée comme certaine.
