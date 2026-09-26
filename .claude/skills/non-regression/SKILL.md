---
name: non-regression
description: Garantit que ce qui fonctionne continue de fonctionner — transforme chaque incident, défaut ou écart d'audit en test automatisé (e2e, unitaire ou cas d'évaluation d'agent), maintient les suites de non-régression critiques, et vérifie qu'aucune modification (code, prompt, skill, modèle, dépendance) ne casse un comportement validé. À utiliser après chaque incident ou défaut corrigé, avant chaque fusion et chaque vague, et quand un comportement déjà validé réapparaît en défaut.
metadata:
  agent: pilote-qualite
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Non-régression

## Règles
1. **Un défaut corrigé = un test** qui aurait détecté le défaut (écrit **avant** ou **avec** le correctif, et qui échoue sans lui).
2. **Un écart d'audit de l'Agent 4** (conversation non conforme) = un **cas d'évaluation** ajouté au dossier `evals/` de l'agent (format commun, données fictives reformulées).
3. Suites :
   - `@critique` e2e + cas bloquants des agents → **chaque PR** ;
   - suite complète → **chaque nuit** ;
   - suite complète + biais/robustesse → **avant chaque vague**.
4. Les changements « invisibles » déclenchent aussi la suite : mise à jour de dépendance, changement de version de modèle d'IA, modification d'un protocole validé, d'un gabarit de message.
5. Un test de non-régression n'est **jamais supprimé** sans justification tracée (fonction retirée) et validation.

## Déroulé après un incident
1. Reproduire sur données fictives.
2. Écrire le test / cas (qui échoue).
3. Vérifier qu'il passe avec le correctif.
4. L'ajouter à la suite adaptée ; référencer l'incident (`INC-…`, `FP-…`) dans le test.
5. Mettre à jour le compteur `cas-de-test` du skill concerné si un cas d'agent est ajouté.

## Exemple [FICTIF]
> INC-FICTIF-004 (ordonnance envoyée à une pharmacie non choisie) → scénario e2e `@critique` « la pharmacie transmise est celle choisie par la patiente » + cas Agent 2 `ordonnance-electronique-securisee` n°2 ; `cas-de-test` passe à 2/3.

## Limites et interdits
- Ne jamais corriger un défaut sans test associé (sauf impossibilité justifiée et tracée).
- Ne jamais supprimer ou affaiblir un test pour faire passer une modification.
- Ne jamais copier une conversation réelle dans un cas : reformuler en fictif.

## Sources
- Feathers M., *Working Effectively with Legacy Code* (2004).
- Google Testing Blog, « Just Say No to More End-to-End Tests » (2015) — équilibre des niveaux.
- ISTQB Foundation v4.0 — tests de confirmation et de régression.
