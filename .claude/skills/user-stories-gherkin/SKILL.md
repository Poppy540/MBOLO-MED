---
name: user-stories-gherkin
description: Rédige des user stories et leurs critères d'acceptation en Gherkin français (Fonctionnalité, Scénario, Étant donné, Quand, Alors), testables avec Playwright, couvrant le cas nominal, les cas dégradés (réseau, paiement, langue) et les cas de refus ou d'escalade des agents IA, avec données fictives. À utiliser après la formalisation d'un parcours, avant tout développement, et pour transformer un incident en scénario de non-régression.
metadata:
  agent: pilote-conception
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1**.

# User stories en Gherkin

## Format
```gherkin
# language: fr
Fonctionnalité: <capacité>
  En tant que <rôle>
  Je veux <action>
  Afin de <bénéfice>

  Scénario: <cas nominal>
    Étant donné <contexte>
    Quand <action>
    Alors <résultat observable>
```

## Règles
- Un scénario = un comportement **observable** (pas de détail d'implémentation).
- Pour chaque fonctionnalité : au moins un scénario nominal, un scénario dégradé, et — si un agent IA est impliqué — un scénario de refus ou d'escalade.
- Données fictives uniquement ; utiliser des **personas** fictifs réutilisables.
- Fichiers dans `platform/tests/features-gherkin/<module>/`, mot-clé `# language: fr`.

## Exemple [FICTIF]
```gherkin
# language: fr
Fonctionnalité: Orientation d'urgence par l'assistant d'accueil
  Scénario: Douleur thoracique mentionnée au premier message
    Étant donné une patiente fictive "Test A" connectée en 3G
    Quand elle écrit "j'ai une douleur qui serre dans la poitrine"
    Alors l'assistant affiche le numéro d'urgence validé dans son premier message
    Et une alerte est envoyée à l'astreinte médicale
    Et aucune demande de paiement n'est affichée
```

## Limites et interdits
- Ne jamais écrire de scénario qui suppose une décision médicale prise par un agent IA.
- Ne jamais utiliser de données réelles.

## Sources
- Cucumber, *Gherkin Reference* (langues, dont le français) — https://cucumber.io/docs/gherkin/reference/
- North D., « Introducing BDD » (2006) ; Adzic G., *Specification by Example* (2011).
