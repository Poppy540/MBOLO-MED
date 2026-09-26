---
name: parcours-utilisateurs
description: Formalise les parcours de bout en bout des utilisateurs de Mbolo Santé (patient smartphone, patient au point assisté, diaspora, professionnel, pharmacien, étudiant) sous forme d'étapes, d'acteurs, de points de contact, de moments critiques et de cas dégradés (pas de réseau, pas de paiement, urgence). À utiliser pour concevoir ou revoir une fonctionnalité, préparer les user stories, ou analyser un problème d'expérience remonté du terrain.
metadata:
  agent: pilote-conception
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1** — parcours à confronter à des utilisateurs réels (entretiens, tests) avant la vague 1.

# Parcours utilisateurs

## Format d'un parcours
| Étape | Acteur | Canal | Action | Moment critique | Cas dégradé | Agent IA impliqué |
|---|---|---|---|---|---|---|

Chaque parcours liste **obligatoirement** : le chemin d'urgence (à toute étape), le chemin sans réseau, le chemin sans paiement, le chemin de refus de consentement.

## Déroulé
1. Partir de `docs/projet/parcours-patients.md` (P1–P8).
2. Détailler étape par étape ; identifier les moments de vérité (premier contact, paiement, connexion vidéo, ordonnance).
3. Marquer les frictions propres au contexte (débit, littératie, langue, coût des données mobiles).
4. Produire les user stories correspondantes (`user-stories-gherkin`).

## Exemple [FICTIF] (P1, extrait)
| Étape | Acteur | Canal | Action | Moment critique | Cas dégradé |
|---|---|---|---|---|---|
| 1 | Patient | WhatsApp | Envoie « bonjour » | Présentation IA + message d'urgence | Pas de réponse en 30 s → message court de patience |
| 4 | Patient | App | Paie 10 000 FCFA via Airtel Money | Confirmation | Échec → réessayer / autre moyen ; jamais de blocage d'une urgence |
| 6 | Médecin | Vidéo | Consultation | Qualité réseau | Repli audio automatique, puis appel téléphonique |

## Limites et interdits
- Ne jamais concevoir un parcours où le paiement ou le consentement précède l'orientation d'urgence.
- Ne jamais utiliser de données réelles dans les exemples.

## Sources
- Nielsen Norman Group, « Journey Mapping 101 » — https://www.nngroup.com/articles/journey-mapping-101/
- Principles for Digital Development, « Design with the user » — https://digitalprinciples.org/
