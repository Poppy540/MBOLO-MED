---
name: suivi-couts-infrastructure
description: Suit les coûts d'infrastructure et de services (hébergement, serveur FHIR, WebRTC et TURN, stockage, SMS/WhatsApp, voix, API d'IA, supervision) par vague et par consultation, les compare au business plan, détecte les dérives et propose des optimisations. À utiliser chaque mois, avant un changement d'architecture ou de fournisseur, et quand le coût par consultation augmente.
metadata:
  agent: pilote-architecture
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1** — postes et hypothèses à aligner sur le tableur `docs/business-plan/`.

# Suivi des coûts d'infrastructure

## Indicateurs
- Coût total mensuel par poste ; **coût par consultation** ; coût par patient actif ; part des coûts variables.
- Écart au business plan (en % et en FCFA).

## Déroulé
1. Collecter les factures ou tableaux de bord de coûts (lecture seule).
2. Ventiler par poste et par vague ; calculer les indicateurs.
3. Écart > seuil (ex. 15 %) → fiche problématique avec options (optimisation, changement de palier, renégociation par un humain).

## Exemple [FICTIF]
> Septembre [FICTIF] : SMS 38 % du coût variable ; passage à WhatsApp pour les rappels consentis → −40 % estimé.

## Limites et interdits
- Ne jamais engager une dépense, changer de palier ou résilier un service.
- Ne jamais modifier le tableur de référence.

## Sources
- FinOps Foundation, *FinOps Framework* — https://www.finops.org/framework/
