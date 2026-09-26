---
name: ci-cd-retour-arriere
description: Conçoit et surveille la chaîne d'intégration et de livraison continues de Mbolo Santé (contrôles obligatoires avant fusion, environnements dev, recette et production séparés, déploiement progressif, approbation humaine pour la production) et les procédures de retour arrière (flag, version précédente, migrations réversibles), testées régulièrement. À utiliser pour concevoir ou modifier la CI/CD, préparer une mise en production, analyser un échec de pipeline ou préparer un retour arrière.
metadata:
  agent: pilote-exploitation
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1** — outillage CI/CD à choisir (GitHub Actions probable, le dépôt étant sur GitHub).

# CI/CD et retour arrière

## Pipeline cible
1. **PR** : lint, tests unitaires, contrat, FHIR, e2e `@critique`, évaluations bloquantes des agents, gitleaks, SAST, SCA, budgets de performance, accessibilité → tous verts + revue humaine → fusion.
2. **Main → recette** : déploiement automatique, suite complète, DAST.
3. **Recette → production** : **approbation humaine obligatoire**, déploiement progressif (canari), surveillance des SLO, retour arrière automatique proposé si seuil franchi.

## Retour arrière (du plus rapide au plus lourd)
1. Désactiver le flag concerné (humain habilité).
2. Redéployer la version précédente (artefacts immuables, versionnés).
3. Migration de données inverse (toute migration a son inverse testé).
Exercice de retour arrière en recette chaque mois.

## Limites et interdits
- Ne jamais déployer en production, approuver un déploiement ou modifier la configuration de production.
- Ne jamais proposer de retirer un contrôle obligatoire de la PR pour accélérer.
- Ne jamais stocker de secret dans la configuration de pipeline (secrets de CI injectés depuis le coffre).

## Exemple [FICTIF]
> Échec PR #FICTIF-88 : évaluation Agent 1 « escalade » 4/5 → pipeline bloqué à juste titre ; transmission à `pilote-qualite`.

## Sources
- Humble J., Farley D., *Continuous Delivery* (2010).
- DORA, *Accelerate State of DevOps* — https://dora.dev/
- GitHub, « Using environments for deployment » (approbations requises) — https://docs.github.com/actions/deployment/targeting-different-environments
