---
name: strategie-test
description: Définit et tient à jour la stratégie de test de Mbolo Santé — pyramide de tests (unitaires, intégration, contrat/API, FHIR, e2e Playwright/Gherkin), évaluations des agents IA, tests de sécurité, de performance faible débit, d'accessibilité et terrain — avec ce qui est testé où, quand, par qui, les données fictives et les critères de sortie par vague. À utiliser au démarrage de chaque module, avant chaque vague, et quand un défaut échappe aux tests.
metadata:
  agent: pilote-qualite
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Stratégie de test

## Principes
1. **Le risque guide l'effort** : plus un défaut peut nuire à un patient, plus il est testé (sécurité patient > données > argent > confort).
2. **Données fictives uniquement**, marquées `[FICTIF]`, générées par des jeux de données versionnés (personas, dossiers FHIR synthétiques — ex. générateur Synthea adapté).
3. **Automatiser** tout ce qui est répétable ; les tests humains se concentrent sur ce qui ne l'est pas (terrain, exploratoire, clinique).
4. **Chaque incident produit un test** (`non-regression`).

## Niveaux
| Niveau | Objet | Outil (proposé) | Quand | Bloquant |
|---|---|---|---|---|
| Unitaire | Fonctions, règles métier | Vitest / Jest, pytest | Chaque commit | Oui |
| Intégration / contrat | API internes (OpenAPI), FHIR (validateur) | Pact / tests d'API, FHIR Validator | Chaque PR | Oui |
| E2E | Parcours utilisateurs | Playwright + Gherkin (`e2e-playwright-gherkin`) | Chaque PR (critique), chaque nuit (complet) | Parcours critiques : oui |
| Agents IA | Cas `evals/` (refus, escalades, injections) | Banc d'évaluation (`evaluation-agents-ia-medicaux`) | Chaque changement de prompt/skill/modèle, chaque nuit | **100 % refus/escalades au vert** |
| Sécurité | Secrets, SAST, SCA, DAST, ASVS | `scans-securite`, `verification-owasp-asvs` | Chaque PR / chaque semaine | Critiques et hautes |
| Performance faible débit | Poids, temps, WebRTC | Lighthouse (mobile lent), profils réseau Playwright | Chaque nuit | Budgets |
| Accessibilité | WCAG 2.2 AA | axe-core dans Playwright | Chaque PR | Erreurs critiques |
| Biais et robustesse | Tests appariés | `tests-biais-robustesse` | Avant vague | Écarts de triage |
| Terrain | Réseau réel, appareils réels, utilisateurs | `tests-terrain-reseau-mobile` | Avant et pendant chaque vague | Critères de vague |

## Critères de sortie par vague (en plus de `docs/deploiement/vagues.md`)
- 100 % des parcours critiques e2e au vert ; 100 % des cas de refus / escalade / injection des agents actifs au vert.
- Tous les skills utilisés par les fonctions activées en `complet` avec ≥ 3 cas au vert.
- Aucune vulnérabilité critique ou haute ouverte.
- Budgets de performance respectés sur profil 3G.

## Livrable
`platform/tests/STRATEGIE.md` (à créer au premier module) : matrice module × niveau, responsables (rôles), environnements (dev, recette), jeux de données.

## Exemple [FICTIF]
> Module ordonnances : unitaires (règles de validité) ; contrat (pharmacie) ; e2e « ordonnance signée → pharmacie choisie → retrait » + « ordonnance non signée refusée » ; Agent 2 : 3 cas `proposition-substitution-generique` ; sécurité : altération en transit.

## Limites et interdits
- Ne jamais utiliser de données réelles de patients, même « anonymisées », dans les tests.
- Ne jamais désactiver ou marquer « ignoré » un test en échec pour livrer ; le corriger ou ouvrir une fiche.
- Ne jamais tester contre la production.

## Sources
- ISTQB, *Certified Tester Foundation Level Syllabus* v4.0 (2023) — test fondé sur les risques.
- Cohn M., *Succeeding with Agile* (pyramide de tests) ; Fowler M., « The Practical Test Pyramid » — https://martinfowler.com/articles/practical-test-pyramid.html
- ISO/IEC/IEEE 29119 (processus de test logiciel).
- Synthea (données de santé synthétiques) — https://synthetichealth.github.io/synthea/
