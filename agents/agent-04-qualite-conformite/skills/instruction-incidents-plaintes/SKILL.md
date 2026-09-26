---
name: instruction-incidents-plaintes
description: Prépare le dossier d'instruction d'un incident de soins, d'un incident lié à un agent IA ou d'une plainte (chronologie factuelle à partir des données pseudonymisées, classification, gravité provisoire, pistes de causes selon une analyse systémique, propositions de mesures), pour décision humaine. À utiliser dès qu'un incident est signalé (par un patient, un professionnel, un agent, l'Agent 6), dès qu'une plainte arrive, ou lors d'un retour d'expérience.
metadata:
  agent: agent-04-qualite-conformite
  statut: v1
  vague: "1"
  cas-de-test: "1/3"
---

> **Version 1** — procédure à aligner sur `docs/securite/plan-incident.md` et sur les obligations de déclaration gabonaises.

# Instruction des incidents et des plaintes

## Déroulé
1. **Risque en cours ?** Si oui → alerte immédiate (directeur médical de garde pour la sécurité patient ; responsable sécurité pour les données). L'instruction vient ensuite.
2. **Classer** : type (soins, IA, données, paiement, comportement), gravité provisoire (critique / élevée / modérée / faible) — la gravité **définitive** est fixée par un humain.
3. **Chronologie factuelle** à partir des journaux et conversations pseudonymisés.
4. **Analyse systémique** (méthode ALARM / London Protocol) : facteurs liés au patient, à la tâche, à l'individu, à l'équipe, à l'environnement, à l'organisation, à l'IA (prompt, skill, outil, modèle).
5. **Propositions** de mesures (correctives, préventives, nouveaux cas de test de non-régression).
6. Dossier transmis au décideur humain. **Clôture d'un incident grave : validation humaine obligatoire.**
7. Plaignant : accusé de réception par un humain ; délais tenus ; réponse rédigée par un humain (l'agent peut préparer un brouillon).

## Exemple [FICTIF]
> INC-FICTIF-004 : ordonnance transmise à une pharmacie non choisie par le patient. Chronologie : … Facteur : interface pré-sélectionnant la dernière pharmacie. Proposition : supprimer la présélection + cas de test.

## Limites et interdits
- Ne jamais clore un incident grave ; ne jamais fixer seul la gravité définitive.
- Ne jamais contacter le plaignant, un partenaire ou une autorité.
- Ne jamais rechercher l'identité du patient.

## Sources
- Taylor-Adams S., Vincent C., *Systems analysis of clinical incidents: the London Protocol* (2004).
- OMS, *Conceptual Framework for the International Classification for Patient Safety* (2009) — https://www.who.int/publications/i/item/WHO-IER-PSP-2010.2
- OMS, *Global Patient Safety Action Plan 2021–2030*.
