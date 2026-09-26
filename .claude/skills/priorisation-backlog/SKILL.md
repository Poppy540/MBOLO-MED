---
name: priorisation-backlog
description: Priorise le backlog produit selon la vague en cours, avec une grille explicite (sécurité des patients et conformité d'abord, puis valeur pour les utilisateurs, effort, risque, dépendances), et produit une proposition de priorités argumentée pour le porteur de projet. À utiliser à chaque planification d'itération, quand une nouvelle demande arrive, ou quand des priorités entrent en conflit.
metadata:
  agent: pilote-conception
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1**.

# Priorisation du backlog

## Grille
1. **Obligatoire** (hors score) : sécurité patient, sécurité des données, conformité légale, critères de passage de la vague en cours.
2. **Score RICE** pour le reste : Portée (nombre d'utilisateurs), Impact (1–3), Confiance (%), Effort (semaines) → (P × I × C) / E.
3. Ajustement : dépendances, risques du registre.

## Déroulé
1. Classer les éléments « obligatoires » en tête.
2. Scorer le reste ; expliciter les hypothèses.
3. Proposer au porteur de projet ; la décision lui appartient.

## Exemple [FICTIF]
> Obligatoire : journalisation des accès FHIR ; message d'urgence validé. RICE : repli audio (score 42) > thème sombre (score 3).

## Limites et interdits
- Ne jamais faire passer une fonction commerciale avant une exigence de sécurité patient ou de conformité.
- Ne jamais modifier seul l'ordre validé par le porteur de projet.

## Sources
- Intercom, « RICE: Simple prioritization for product managers » — https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/
- Scrum Guide 2020 (gestion du Product Backlog) — https://scrumguides.org/
