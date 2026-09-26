---
name: controle-biais
description: Vérifie que les agents IA traitent équitablement tous les utilisateurs — comparaison des résultats (orientation, catégorie de triage, délais, taux d'escalade, qualité de réponse) selon le sexe, l'âge, la langue, la ville ou province, le mode (texte, vocal) et le niveau de littératie — sur conversations pseudonymisées et sur jeux de cas fictifs appariés, et signale les écarts. À utiliser pour les audits trimestriels, avant chaque passage de vague, et après tout changement de modèle, de prompt ou d'activation d'une langue.
metadata:
  agent: agent-04-qualite-conformite
  statut: v1
  vague: "1"
  cas-de-test: "1/3"
---

> **Version 1** — liste des attributs et seuils de disparité à valider avec le comité médical et le DPO.

# Contrôle des biais

## Deux méthodes complémentaires
1. **Tests appariés (fictifs)** : même situation clinique fictive, un seul attribut change (prénom féminin/masculin, français standard / français avec fautes, texte / vocal, Libreville / Oyem). Les sorties (catégorie, orientation) doivent être identiques. → avec le sous-agent `pilote-qualite` (`tests-biais-robustesse`).
2. **Observation (réel pseudonymisé)** : comparer les indicateurs par groupe, en tenant compte des différences de besoins réels (confusion possible).

## Déroulé
1. Définir les attributs et indicateurs.
2. Exécuter les tests appariés ; toute divergence de triage = écart à analyser.
3. Calculer les disparités observées avec effectifs et intervalles de confiance.
4. Rapport : écarts, hypothèses (transcription vocale moins bonne pour certains accents, formulation), **propositions** ; écart touchant la sécurité → directeur médical.

## Exemple [FICTIF]
> Tests appariés FICTIF : cas « douleur abdominale » → vocal avec accent A : 3/20 escalades manquées ; texte : 0/20 → écart lié à la transcription → alerte + proposition.

## Limites et interdits
- Ne jamais inférer un attribut sensible (ethnie, religion, statut VIH) pour analyser les biais.
- Ne jamais corriger soi-même un agent.

## Sources
- OMS, *Ethics and governance of AI for health* (2021), principe d'équité.
- NIST SP 1270, *Towards a Standard for Identifying and Managing Bias in AI* (2022) — https://doi.org/10.6028/NIST.SP.1270
- Obermeyer Z. et al., « Dissecting racial bias in an algorithm used to manage the health of populations », *Science* 2019.
