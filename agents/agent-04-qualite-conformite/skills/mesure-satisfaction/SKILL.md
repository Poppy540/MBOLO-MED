---
name: mesure-satisfaction
description: Conçoit et analyse des mesures de satisfaction et d'expérience des patients et des professionnels adaptées au contexte (questions très courtes, vocal ou pictogrammes, par SMS ou WhatsApp) — satisfaction globale, recommandation, résolution du besoin, qualité de connexion — et produit des indicateurs agrégés par vague, ville et type de consultation. À utiliser après les consultations, pour les revues de vague, et quand un indicateur de satisfaction baisse.
metadata:
  agent: agent-04-qualite-conformite
  statut: v1
  vague: "1"
  cas-de-test: "1/3"
---

> **Version 1** — questionnaire à tester sur le terrain.

# Mesure de la satisfaction

## Questionnaire patient (3 questions maximum, consentement aux messages requis)
1. « Êtes-vous satisfait(e) de votre consultation ? » 😣 😐 🙂 😀
2. « Votre problème a-t-il été pris en charge ? » Oui / En partie / Non
3. « La connexion était : » Bonne / Coupures / Impossible
+ facultatif : message vocal libre.

## Indicateurs
Satisfaction moyenne, taux de « problème pris en charge », taux de connexions difficiles, par ville, type (smartphone / point assisté), spécialité, vague. Toujours avec **effectifs** et intervalle de confiance ; pas de conclusion sur moins de 30 réponses.

## Déroulé
1. Envoi 24 h après la consultation (1 relance maximum).
2. Agrégation pseudonymisée ; commentaires libres pseudonymisés avant lecture.
3. Commentaire évoquant un danger, une plainte ou un incident → `instruction-incidents-plaintes` ; urgence → message d'urgence standard.
4. Rapport mensuel pour la revue de vague.

## Exemple [FICTIF]
> Vague 1, septembre [FICTIF] : 212 réponses, 81 % satisfaits (IC 95 % 75-86 %), connexions difficiles 19 % (province 34 %).

## Limites et interdits
- Ne jamais relancer plus d'une fois ; ne jamais conditionner un service à une réponse.
- Ne jamais présenter un résultat sans effectif.

## Sources
- OCDE, *Patient-Reported Indicator Surveys (PaRIS)* — https://www.oecd.org/health/paris/
- NHS England, *Friends and Family Test guidance* — https://www.england.nhs.uk/fft/
