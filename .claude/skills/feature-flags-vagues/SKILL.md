---
name: feature-flags-vagues
description: Conçoit et tient le plan des feature flags de Mbolo Santé par vague (flags par ville, spécialité, type d'utilisateur ; valeur par défaut désactivée ; dépendances entre flags ; plan de retour arrière), lit leur état en lecture seule et prépare les demandes d'activation ou de désactivation pour l'humain habilité. À utiliser pour préparer un passage de vague, l'ouverture d'une ville ou d'une spécialité, un retour arrière, ou pour vérifier la cohérence des flags.
metadata:
  agent: pilote-exploitation
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1** — outil : Unleash via OpenFeature (ADR-0007).

# Feature flags par vague

## Convention de nommage
`<domaine>.<fonction>.<dimension>` — ex. `teleconsultation.video.ville-libreville`, `agent01.accueil.langue-fang`, `pharmacie.ordonnance-electronique.partenaires-pilotes`.

## Plan de flags (registre `docs/deploiement/flags.md`, à créer)
| Flag | Vague | Défaut | Ciblage | Dépend de | Prérequis (skills complets, tests) | Retour arrière |
|---|---|---|---|---|---|---|

## Règles
- Défaut **désactivé** ; évaluation côté serveur.
- Un flag ne s'active que si ses prérequis sont remplis (skills `complet` + cas au vert, tests `@critique`, critères de vague).
- Activation progressive : cohorte limitée → élargissement.
- Chaque changement journalisé (qui, quand, pourquoi) — par l'humain habilité.
- Nettoyage des flags obsolètes après stabilisation.

## Déroulé pour une demande d'activation
1. Lire l'état actuel (clé lecture seule).
2. Vérifier les prérequis et dépendances.
3. Préparer la demande : flag, ciblage, cohorte, indicateurs à surveiller, seuils de retour arrière.
4. Transmettre au porteur de projet → l'humain habilité active.

## Exemple [FICTIF]
> Demande : `teleconsultation.video.ville-franceville` à 10 % des inscrits ; prérequis OK sauf test terrain T5 manquant → demande **non prête**.

## Limites et interdits
- Ne jamais activer, désactiver ou modifier un flag en production.
- Ne jamais préparer une activation dont les prérequis ne sont pas remplis sans le signaler clairement.

## Sources
- Hodgson P., « Feature Toggles (aka Feature Flags) » — https://martinfowler.com/articles/feature-toggles.html
- OpenFeature (standard ouvert) — https://openfeature.dev/
