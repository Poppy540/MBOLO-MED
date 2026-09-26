---
name: suivi-pipeline-crm
description: Tient à jour le pipeline de recrutement dans le CRM (étapes, prochaines actions, relances, indicateurs de conversion par spécialité et par source) et produit un point hebdomadaire pour l'équipe. À utiliser après chaque interaction consignée par un recruteur, chaque changement d'étape, et pour préparer la revue hebdomadaire du recrutement ou répondre à « où en est-on pour la spécialité X ? ».
metadata:
  agent: agent-03-recrutement
  statut: v1
  vague: "1"
  cas-de-test: "1/3"
---

> **Version 1** — étapes du pipeline à ajuster avec l'équipe.

# Suivi du pipeline CRM

## Étapes
`identifié` → `contacté (humain)` → `intéressé` → `pré-vérifié` → `vérifié (humain)` → `contrat (humain)` → `onboarding` → `actif` · sorties : `non intéressé`, `opposition`, `non retenu`.

## Déroulé
1. Mettre à jour la fiche à partir des notes du recruteur (pas d'invention).
2. Proposer la prochaine action et sa date ; signaler les relances en retard.
3. Hebdomadaire : effectifs par étape et spécialité, taux de conversion par source, délais moyens, besoins non couverts pour la vague à venir.
4. Remonter à l'Agent 6 (via l'équipe) les écarts avec les besoins de la vague.

## Exemple [FICTIF]
> Semaine 39 [FICTIF] : pédiatrie — 5 identifiés, 2 intéressés, 1 pré-vérifié ; besoin vague 1 : 3 → écart 2.

## Limites et interdits
- Ne jamais passer un candidat à `vérifié` ou `contrat` : réservé à un humain.
- Ne jamais consigner de donnée sensible (santé, opinions, vie privée).
- Ne jamais exporter la base.

## Sources
- RGPD art. 5 (exactitude, minimisation) ; bonnes pratiques CRM de la CNIL.
