---
name: continuite-reprise
description: Prépare le plan de continuité et de reprise d'activité de Mbolo Santé — objectifs de temps et de perte de données (RTO, RPO) par service, sauvegardes chiffrées et restaurations testées, modes dégradés (audio, téléphone, SMS, procédure papier au point assisté), dépendances fournisseurs, exercices — sans jamais agir sur la production. À utiliser pour concevoir la résilience d'un service, préparer ou analyser un exercice de reprise, et après toute panne majeure.
metadata:
  agent: pilote-exploitation
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1**.

# Continuité et reprise d'activité

## Objectifs proposés
| Service | RTO | RPO | Mode dégradé |
|---|---|---|---|
| Accueil + message d'urgence | 15 min | 0 (pas de perte de conversation en cours visée) | Message d'urgence statique servi par un CDN ; numéro affiché dans l'application hors ligne |
| Dossier FHIR | 4 h | 15 min | Lecture seule ; résumé local chiffré côté professionnel |
| Téléconsultation | 1 h | — | Audio → appel téléphonique |
| Ordonnances | 4 h | 0 | Ordonnance PDF signée transmise par canal de secours validé |

## Règles
- Sauvegardes chiffrées, hors site, **restaurations testées** chaque mois en recette (une sauvegarde non restaurée n'existe pas).
- Dépendances fournisseurs cartographiées (SMS, paiement, IA, vidéo) avec alternative ou mode dégradé.
- Exercice annuel complet ; exercices ciblés trimestriels.

## Exemple [FICTIF]
> Exercice R2 [FICTIF] : restauration FHIR en 5 h 10 (objectif 4 h) → fiche avec options.

## Limites et interdits
- Ne jamais lancer une restauration ou une bascule sur la production.
- Ne jamais utiliser de sauvegarde de production en recette (données réelles).

## Sources
- ISO 22301:2019 (continuité d'activité) ; NIST SP 800-34 Rev. 1 (contingency planning) — https://doi.org/10.6028/NIST.SP.800-34r1
