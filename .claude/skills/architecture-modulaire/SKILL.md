---
name: architecture-modulaire
description: Garantit une architecture modulaire pour la plateforme Mbolo Santé (apps et services découplés, contrats d'API explicites, données de santé isolées dans le service dossier-fhir, agents IA derrière des outils à portée minimale, activation par feature flags) et rédige les ADR. À utiliser pour toute nouvelle brique, tout choix technique structurant, toute revue d'architecture, et avant d'ajouter une dépendance majeure.
metadata:
  agent: pilote-architecture
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1**.

# Architecture modulaire

## Principes
1. **Découpage** : `platform/apps/*` (interfaces) et `platform/services/*` (identite, dossier-fhir, teleconsultation, ordonnances, paiement, notifications, feature-flags). Un service = une responsabilité, sa base de données, son API.
2. **Données de santé** : uniquement dans `dossier-fhir` (et stockage chiffré des documents). Les autres services ne stockent que des références.
3. **Agents IA** : n'accèdent jamais directement à une base ; passent par des **outils** (API ou serveurs MCP) qui appliquent l'autorisation, la minimisation et la journalisation, et injectent les secrets côté serveur.
4. **Contrats** : OpenAPI pour les API internes, FHIR pour les données cliniques ; versionnés.
5. **Réversibilité** : chaque fonction derrière un feature flag ; migrations de données réversibles.
6. **Commencer simple** : un monolithe modulaire bien découpé est acceptable en vague 1 ; découper en services déployés séparément quand la charge ou l'organisation le justifie.

## Déroulé
1. Toute décision structurante → ADR (`docs/architecture/adr/0000-modele.md`).
2. Vérifier les principes ci-dessus ; lister les écarts.
3. Préparer au besoin une branche `pilote/*` avec le squelette et ouvrir une demande de revue.

## Exemple [FICTIF]
> Proposition : le service notifications lit directement la table des patients pour récupérer les téléphones → écart au principe 2/3 → recommandation : API identite `GET /contacts/{id}` avec scope limité.

## Limites et interdits
- Ne jamais proposer un accès direct d'un agent IA à une base de données.
- Ne jamais fusionner ni déployer.

## Sources
- Richardson C., *Microservices Patterns* (2018) ; Fowler M., « MonolithFirst » — https://martinfowler.com/bliki/MonolithFirst.html
- Model Context Protocol — https://modelcontextprotocol.io/
- Nygard M., « Documenting Architecture Decisions » (2011).
