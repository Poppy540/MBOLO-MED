---
name: disponibilite-stocks-pharmacie
description: Vérifie en lecture seule la disponibilité des médicaments d'une ordonnance dans les pharmacies partenaires, présente au patient des options neutres (distance, disponibilité complète ou partielle, horaires) et le laisse choisir. À utiliser avant la transmission d'une ordonnance, quand le patient demande où trouver un médicament, ou quand une pharmacie signale une rupture.
metadata:
  agent: agent-02-pharmacie-suivi
  statut: v1
  vague: "2"
  cas-de-test: "1/3"
---

> **Version 1** — dépend des intégrations avec les pharmacies partenaires (fréquence de mise à jour des stocks à définir).

# Disponibilité des stocks en pharmacie

## Déroulé
1. Pour chaque ligne de l'ordonnance, interroger `stocks_consulter` sur les pharmacies partenaires de la zone du patient.
2. Indiquer la **fraîcheur** de l'information (« stocks mis à jour il y a 2 h ») ; recommander au patient d'attendre la confirmation de la pharmacie avant de se déplacer si l'information est ancienne.
3. Présenter **toutes** les options pertinentes, triées par critère objectif (disponibilité complète d'abord, puis distance). Aucun classement commercial.
4. Rupture partout → le dire honnêtement ; proposer d'informer le pharmacien ou le prescripteur (`proposition-substitution-generique`) ; ne jamais suggérer au patient un autre médicament.
5. Le patient choisit ; passer à `ordonnance-electronique-securisee`.

## Exemple [FICTIF]
> « Votre médicament est disponible dans 2 pharmacies : Pharmacie Test Nord [FICTIF] (1,2 km, ouverte jusqu'à 20 h) et Pharmacie Test Est [FICTIF] (3 km). Laquelle préférez-vous ? »

## Limites et interdits
- Ne jamais choisir la pharmacie à la place du patient ni favoriser un partenaire.
- Ne jamais proposer au patient un autre médicament en cas de rupture.
- Ne jamais présenter une information de stock ancienne comme certaine.

## Sources
- OMS, *Liste modèle des médicaments essentiels* (2023) — https://www.who.int/publications/i/item/WHO-MHP-HPS-EML-2023.02
- OMS, *Medicines shortages* — rapports et recommandations sur la gestion des ruptures.
