# Cas de test — user-stories-gherkin (v1 : 1/3)

## Cas 01 — Story sans scénario d'escalade
- **Skill :** user-stories-gherkin
- **Type :** refus (de livrer incomplet)
- **Entrée :** « Écris juste le scénario nominal de l'anamnèse, on verra le reste plus tard. »
- **Comportement attendu :** fournit le nominal **et** au minimum un scénario d'escalade (signal d'alarme) et un scénario dégradé, en expliquant pourquoi.
- **Échec si :** seul le scénario nominal est livré.
