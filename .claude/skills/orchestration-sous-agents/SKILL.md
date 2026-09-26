---
name: orchestration-sous-agents
description: Découpe une demande du porteur de projet par domaine, la délègue au bon sous-agent pilote (conception, architecture, sécurité, qualité, exploitation, projet) avec un brief précis, puis consolide, dédoublonne et vérifie les réponses. À utiliser pour toute demande qui touche plusieurs domaines, pour préparer un rapport consolidé, ou quand il faut savoir quel pilote est responsable d'un sujet.
metadata:
  agent: pilote-orchestrateur
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1**.

# Orchestration des sous-agents

## Table de routage
| Sujet | Pilote |
|---|---|
| Besoin, parcours, UX, backlog, consentement des proches | `pilote-conception` |
| Architecture, FHIR, eGabon-SIS, performance réseau, revue de code, dette, coûts cloud | `pilote-architecture` |
| Menaces, vulnérabilités, secrets, conformité données, incidents de sécurité | `pilote-securite` |
| Tests, évaluation des agents IA, biais, régression, tests terrain | `pilote-qualite` |
| Feature flags, CI/CD, SLO, continuité, matériel des points assistés | `pilote-exploitation` |
| Planning, risques, budget, retours terrain, passage de vague, tableau de bord | `pilote-projet` |

## Brief de délégation (modèle)
```
Objectif : <question précise>
Contexte : <ce qu'on sait, fichiers utiles>
Livrable : <format attendu, longueur>
Contraintes : niveaux 1–3 ; aucune donnée nominative ; sources obligatoires
Échéance : <…>
```

## Consolidation
1. Vérifier que chaque chiffre a une source ; recouper les chiffres contradictoires entre pilotes.
2. Dédoublonner les constats ; les rattacher aux fiches et risques existants.
3. Prioriser : sécurité patient > sécurité des données > blocage de vague > le reste.
4. Répondre au porteur de projet en commençant par la conclusion.

## Exemple [FICTIF]
> Demande : « Sommes-nous prêts pour la vague 1 ? » → `pilote-projet` (critères), `pilote-securite` (vulnérabilités, AIPD), `pilote-qualite` (cas de test), `pilote-exploitation` (SLO) → synthèse + fiche si un critère bloque.

## Limites et interdits
- Ne jamais déléguer une action interdite (niveau 5) ni demander à un pilote de contourner ses règles.
- Ne jamais transmettre de données nominatives dans un brief.
- Ne jamais masquer au porteur de projet un désaccord entre pilotes : le présenter.

## Sources
- Anthropic, *Claude Code — Subagents* — https://docs.claude.com/en/docs/claude-code/sub-agents
- Anthropic, « How we built our multi-agent research system » (2025) — https://www.anthropic.com/engineering/multi-agent-research-system
