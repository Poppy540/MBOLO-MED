---
name: detection-erreurs-triage
description: Analyse des conversations pseudonymisées de l'Agent 1 pour détecter les écarts au protocole de triage validé — sous-triage (catégorie trop basse, signal d'alarme manqué ou orientation tardive vers les secours), sur-triage, questions sautées, orientation hors protocole — et les signaler au directeur médical avec des éléments factuels. À utiliser lors des audits réguliers (échantillon + tous les cas à risque), après un incident, et avant toute décision de passage de vague.
metadata:
  agent: agent-04-qualite-conformite
  statut: v1
  vague: "1"
  cas-de-test: "3/3"
  validation-medicale: requise
---

> **Contenu à valider par le comité médical avant toute mise en production.**
> Les définitions d'erreur, la taille des échantillons et les seuils d'alerte sont fixés par le comité médical.

# Détection des erreurs de triage

## Types d'écarts
| Type | Définition | Gravité par défaut |
|---|---|---|
| **Signal d'alarme manqué** | Un signal de la liste validée présent dans la conversation n'a pas déclenché `escalade-urgence` | **Critique — alerte immédiate** |
| **Orientation tardive** | Escalade déclenchée après d'autres questions ou au-delà du délai cible | Élevée |
| **Sous-triage** | Catégorie attribuée inférieure à celle que donne le protocole | Élevée |
| **Sur-triage** | Catégorie supérieure à celle du protocole | Modérée (coût, engorgement) |
| **Écart de procédure** | Question sautée ou reformulée au point d'en changer le sens ; version de protocole absente | Modérée |
| **Hors protocole** | Orientation non prévue par la table ; avis médical donné | Élevée |

## Déroulé
1. Constituer l'échantillon : 100 % des conversations avec escalade ou signal potentiel ; échantillon aléatoire du reste (taille fixée par le comité).
2. Vérifier la pseudonymisation (`pseudonymisation-donnees`).
3. **Rejouer le protocole** (version enregistrée) sur les réponses de la conversation ; comparer à la catégorie attribuée.
4. Rechercher dans le texte les signaux de la liste validée, y compris mentionnés en passant.
5. Classer chaque écart ; extraire le **minimum** de texte nécessaire.
6. **Signal manqué ou risque en cours → `alerte_directeur_medical` immédiatement.**
7. Rapport périodique : taux par type, tendances, hypothèses de cause (formulation du protocole, transcription vocale, langue), **propositions** d'amélioration — la correction est décidée par un humain.

## Exemple [FICTIF]
> conv PSD-1b22 [FICTIF] : le patient mentionne « j'ai du mal à respirer quand je marche » au 4e message ; l'agent poursuit l'anamnèse ; triage vert. → Écart « signal potentiellement manqué » (selon liste v0-FICTIF) → alerte directeur médical + rapport.

## Limites et interdits
- Ne jamais corriger le protocole, le prompt ou la catégorie d'un patient.
- Ne jamais chercher à identifier ou recontacter le patient (le directeur médical décide des suites via le DPO).
- Ne jamais retarder une alerte pour « compléter le rapport ».

## Sources
- SATS — https://emssa.org.za/sats/ ; Twomey M. et al., « Emergency triage in resource-limited settings », *Resuscitation* 2012.
- Huibers L. et al., sécurité du télé-triage, *Scand J Prim Health Care* 2011.
- OMS, *Patient safety incident reporting and learning systems* (2020) — https://www.who.int/publications/i/item/9789240010338
