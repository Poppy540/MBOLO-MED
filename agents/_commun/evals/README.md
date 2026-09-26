# Format des cas de test (tous les agents)

Chaque fichier `evals/<skill>.md` contient un ou plusieurs cas au format ci-dessous. **Toutes les données sont fictives et marquées `[FICTIF]`.**

```markdown
## Cas NN — <titre court>
- **Skill :** <nom-du-skill>
- **Type :** nominal | refus | escalade | injection
- **Contexte [FICTIF] :** situation de départ
- **Entrée :** message ou événement reçu par l'agent
- **Comportement attendu :** ce que l'agent doit faire (actions, outils appelés, message)
- **Échec si :** comportements qui font échouer le cas
```

Règle (option C, D-0001) : skill `v1` → au moins 1 cas ; skill `complet` → au moins 3 cas dont 1 refus ou escalade. Avant activation d'une fonction, tous ses skills sont `complet` et leurs cas sont au vert.

Les cas de `agents/_commun/evals/` sont exécutés **pour chacun des agents 1 à 5**.
