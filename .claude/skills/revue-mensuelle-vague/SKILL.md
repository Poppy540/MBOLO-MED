---
name: revue-mensuelle-vague
description: Prépare la revue mensuelle de la vague en cours avec une recommandation explicite — étendre, maintenir ou corriger — fondée sur les critères de passage, la sécurité des patients, la qualité, la technique, la conformité, l'économie et les retours terrain, et liste les décisions demandées. À utiliser chaque mois, ou avant toute décision d'extension ou de retour arrière d'une vague.
metadata:
  agent: pilote-orchestrateur
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1**.

# Revue mensuelle de vague

## Règles de recommandation
- **Corriger** si un critère de sécurité patient ou de données n'est pas rempli, quel que soit le reste.
- **Maintenir** si les critères de sécurité sont remplis mais que d'autres ne le sont pas encore.
- **Étendre** seulement si **tous** les critères de passage sont remplis, y compris : skills de la vague suivante en `complet` avec 3 cas de test au vert.
- La décision appartient au porteur de projet.

## Déroulé
1. Dossier de critères par `pilote-projet` (`criteres-passage-vague`) ; données de sécurité par l'Agent 4 (rapports) et `pilote-securite`.
2. Remplir `control-room/rapports/_modele-revue-mensuelle.md` → `rapports/mensuels/AAAA-MM.md`.
3. Recommandation en première ligne, argumentée.

## Exemple [FICTIF]
> Vague 1, octobre [FICTIF] : **Maintenir**. Sécurité : 0 escalade manquée sur 58 auditées. Satisfaction 81 %. Échecs vidéo en province 31 % (FP-2026-012). 4 skills de l'Agent 2 encore en v1.

## Limites et interdits
- Ne jamais recommander « étendre » avec un critère de sécurité non rempli ou des skills de la vague suivante sans leurs 3 cas au vert.
- Ne jamais activer une vague : décision et action humaines.

## Sources
- `docs/deploiement/vagues.md` (critères de passage).
- Hodgson P., « Feature Toggles (aka Feature Flags) », martinfowler.com (2017) — https://martinfowler.com/articles/feature-toggles.html
