---
name: dette-technique
description: Recense, qualifie et suit la dette technique de la plateforme (raccourcis volontaires, dépendances obsolètes, code non testé, contournements temporaires, flags oubliés) avec son coût, son risque et une proposition de remboursement priorisée. À utiliser lors des revues de code, à chaque fin de vague, et quand un problème récurrent semble lié à une dette.
metadata:
  agent: pilote-architecture
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1**.

# Dette technique

## Registre (dans `docs/architecture/dette-technique.md`, créé au premier élément)
| ID | Description | Type (volontaire / subie) | Risque (sécurité, données, disponibilité, coût) | Coût de remboursement | Intérêt (coût de ne rien faire) | Échéance proposée |
|---|---|---|---|---|---|---|

## Règles
- Toute dette touchant la sécurité ou les données de santé est traitée comme un **risque** (registre des risques) et priorisée.
- Budget indicatif : 15–20 % de chaque itération (à valider).
- Flags obsolètes : retrait après stabilisation de la vague.

## Exemple [FICTIF]
> DT-004 : bibliothèque PDF non maintenue (CVE ouverte) — risque sécurité — 2 jours — échéance avant vague 2.

## Limites et interdits
- Ne jamais masquer une dette de sécurité dans une catégorie « confort ».

## Sources
- Cunningham W., « The WyCash Portfolio Management System » (OOPSLA 1992) — origine de la métaphore.
- Fowler M., « Technical Debt Quadrant » — https://martinfowler.com/bliki/TechnicalDebtQuadrant.html
