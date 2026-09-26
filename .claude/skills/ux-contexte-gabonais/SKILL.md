---
name: ux-contexte-gabonais
description: Vérifie et améliore l'adaptation des écrans et des conversations au contexte gabonais — faible débit et coût des données mobiles, smartphones d'entrée de gamme, faible littératie (vocal, pictogrammes, peu de texte), langues locales, confiance, mobile money — avec une grille de revue et des recommandations concrètes. À utiliser pour toute maquette, tout parcours, tout texte d'interface ou toute conversation d'agent avant développement et avant chaque vague.
metadata:
  agent: pilote-conception
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1** — à enrichir par les tests avec des utilisateurs réels à Libreville et en province.

# UX adaptée au contexte gabonais

## Grille de revue
| Critère | Cible indicative (à valider) |
|---|---|
| Poids d'un écran | < 200 Ko au premier chargement ; images compressées ; mode « économie de données » |
| Fonctionne en 3G lente / hors ligne | Formulaires sauvegardés localement, reprise après coupure |
| Appareils | Android d'entrée de gamme (1–2 Go de RAM), petit écran |
| Texte | Phrases ≤ 12 mots, un message = une idée ; boutons avec pictogramme |
| Vocal | Toute saisie possible en vocal ; lecture audio des messages |
| Langues | Français, puis langues locales validées ; interprète |
| Confiance | Nom et photo réels des professionnels, IA clairement signalée, prix affiché avant engagement |
| Paiement | Airtel Money, Moov Money ; confirmation claire ; reçu |
| Accessibilité | Contrastes WCAG AA, tailles de police, lecteurs d'écran |

## Déroulé
1. Appliquer la grille ; noter les écarts avec capture ou extrait.
2. Proposer des corrections concrètes.
3. Transformer les points bloquants en user stories.

## Exemple [FICTIF]
> Écran « Inscription » : 1,2 Mo, 9 champs obligatoires, texte de 80 mots → recommandation : 3 champs, pictogrammes, vocal, image compressée (≤ 150 Ko).

## Limites et interdits
- Ne jamais sacrifier un message de sécurité (urgence, consentement) à la simplification.
- Ne jamais tester avec de vraies données de patients.

## Sources
- GSMA, *The State of Mobile Internet Connectivity* (rapports annuels) — https://www.gsma.com/r/somic/
- Google, *Build for Billions* / Web.dev « Fast load times » — https://web.dev/explore/fast
- Medhi I. et al., « Designing mobile interfaces for novice and low-literacy users », *ACM TOCHI* 2011.
- W3C WCAG 2.2.
