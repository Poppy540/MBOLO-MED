---
name: rapport-hebdomadaire
description: Produit le rapport hebdomadaire du porteur de projet — synthèse, avancement par domaine, indicateurs par rapport à la cible, fiches ouvertes et décidées, évolution des risques, budget réel comparé au tableur, priorités et décisions de la semaine suivante — avec sources. À utiliser chaque fin de semaine ou sur demande d'un point d'étape.
metadata:
  agent: pilote-orchestrateur
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1**.

# Rapport hebdomadaire

## Déroulé
1. Demander à chaque pilote son point de la semaine (`orchestration-sous-agents`).
2. Remplir `control-room/rapports/_modele-rapport-hebdo.md` → `rapports/hebdomadaires/AAAA-Sxx.md`.
3. Synthèse de 5 lignes en tête : ce qui va, ce qui ne va pas, ce qu'il faut décider.
4. Comparer aux engagements de la semaine précédente (faits / non faits et pourquoi).
5. Lister les sources en fin de rapport.

## Exemple [FICTIF]
> Synthèse S40 : construction à 68 % de la vague 0 ; AIPD en retard (juriste non désigné) ; décision attendue sur l'hébergeur ; budget conforme (−3 %).

## Limites et interdits
- Ne jamais embellir : un engagement non tenu est indiqué comme tel.
- Ne jamais inclure de donnée nominative ou de secret.

## Sources
- PMI, *PMBOK Guide*, 7e éd. — domaine de performance « Mesure ».
- Reporting RAG (rouge / orange / vert) en gestion de projet.
