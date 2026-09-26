# Éléments communs aux agents de la plateforme

Ce dossier contient ce qui s'applique à **tous** les agents (1 à 5) :

- `skills/garde-fous-communs/` : règles transverses (injection de prompt, transparence IA, secrets, urgence, périmètre). **Chargé par tous les agents, en permanence.**
- `evals/` : cas de test de ces règles, à exécuter pour chaque agent.

Les règles communes détaillées (droits et interdits) sont dans le §7.0 du prompt fondateur, reprises dans chaque `permissions.md`.
