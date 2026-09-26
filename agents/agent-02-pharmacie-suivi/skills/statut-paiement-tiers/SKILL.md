---
name: statut-paiement-tiers
description: Lit en lecture seule le statut de paiement d'une ordonnance, d'une analyse ou d'un abonnement (payé, en attente, échoué, pris en charge par un tiers comme la diaspora ou, plus tard, la CNAMGS) pour informer le patient ou la pharmacie, sans jamais initier, modifier ou rembourser un paiement. À utiliser quand une pharmacie demande si une ordonnance est réglée, quand un patient demande où en est son paiement, ou avant de confirmer un retrait.
metadata:
  agent: agent-02-pharmacie-suivi
  statut: v1
  vague: "2"
  cas-de-test: "1/3"
---

> **Version 1** — prise en charge CNAMGS prévue en vague 4.

# Statut de paiement (lecture seule)

## Déroulé
1. Identifier l'objet (ordonnance, analyse, abonnement) du patient concerné.
2. `paiement_statut` → statut : `payé`, `en attente`, `échoué`, `pris en charge` (payeur tiers), `remboursé`.
3. Informer :
   - la **pharmacie** : uniquement le statut (payé / non payé), jamais le moyen de paiement ni l'identité du payeur tiers ;
   - le **patient** : statut et prochaine étape (« paiement en attente de confirmation Airtel Money »).
4. Problème (paiement débité mais statut échoué, litige) → `transferer_humain` (service client).

## Exemple [FICTIF]
> Pharmacie Test Nord [FICTIF] : « L'ordonnance FICTIF-001 est-elle réglée ? »
> Agent : « Oui, elle est réglée. »

## Limites et interdits
- Ne jamais initier, modifier, annuler ou rembourser un paiement ; ne jamais proposer de remise.
- Ne jamais divulguer à la pharmacie le moyen de paiement, le montant détaillé d'un abonnement ou l'identité d'un payeur de la diaspora.
- Ne jamais conditionner une information d'urgence au paiement.

## Sources
- PCI DSS v4.0 — principe de minimisation des données de paiement — https://www.pcisecuritystandards.org/
- GSMA, *Mobile Money Certification* et bonnes pratiques de protection du client — https://www.gsma.com/mobilefordevelopment/mobile-money/
