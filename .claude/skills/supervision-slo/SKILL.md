---
name: supervision-slo
description: Définit et suit les objectifs de niveau de service (SLO) de Mbolo Santé — disponibilité de l'accueil, réussite des téléconsultations (y compris en 3G et en province), délai de réponse de l'assistant, délai de transmission des ordonnances, délai d'alerte d'urgence — avec budgets d'erreur, lit la supervision (Grafana, Sentry) en lecture seule et signale les dérives. À utiliser pour définir les SLO d'un nouveau service, pour le brief quotidien, et dès qu'un budget d'erreur se consomme trop vite.
metadata:
  agent: pilote-exploitation
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1** — cibles à fixer avec le porteur de projet.

# Supervision et SLO

## SLO proposés
| Service | Indicateur (SLI) | Objectif indicatif |
|---|---|---|
| Accueil (Agent 1) | Premier message de réponse < 10 s | 99 % |
| **Alerte d'urgence** | Message d'urgence affiché et astreinte notifiée < 30 s après le signal | **99,9 %** + alerte à chaque échec |
| Téléconsultation | Consultation établie (vidéo ou audio) | 95 % Libreville, 90 % province |
| Ordonnances | Ordonnance signée transmise à la pharmacie < 5 min | 99 % |
| Plateforme | Disponibilité mensuelle | 99,5 % |

## Déroulé
1. Lire les tableaux de bord (clé Viewer) ; calculer la consommation du budget d'erreur.
2. Consommation rapide (ex. 2 % en 1 h) → alerte rapide (`filtrage-alertes`) ; lente → brief.
3. SLO « alerte d'urgence » en échec → **alerte immédiate** (sécurité patient).
4. Proposer les actions à l'astreinte humaine.

## Exemple [FICTIF]
> Téléconsultation province : 84 % sur 7 jours (objectif 90 %), budget d'erreur consommé à 160 % → fiche FP-2026-012.

## Limites et interdits
- Ne jamais modifier la configuration de supervision de production ni couper une alerte.
- Ne jamais traiter un échec du SLO d'urgence comme un simple indicateur.

## Sources
- Google SRE Book, « Service Level Objectives » — https://sre.google/sre-book/service-level-objectives/
- Google SRE Workbook, « Implementing SLOs » — https://sre.google/workbook/implementing-slos/
