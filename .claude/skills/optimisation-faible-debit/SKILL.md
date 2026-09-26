---
name: optimisation-faible-debit
description: Analyse et optimise la plateforme pour les réseaux 3G/4G instables et coûteux — budget de poids des pages, mise en cache et hors ligne (PWA, service workers), compression, vidéo WebRTC adaptative et repli audio, API économes, messages légers — et fixe des budgets de performance vérifiés en CI. À utiliser pour toute revue de performance, avant chaque vague, et quand les échecs de connexion ou les temps de chargement augmentent.
metadata:
  agent: pilote-architecture
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1** — cibles à calibrer par les tests terrain (`tests-terrain-reseau-mobile`).

# Optimisation pour le faible débit

## Leviers
| Domaine | Mesures |
|---|---|
| Web / app | Budget ≤ 200 Ko au premier chargement ; PWA, service worker, cache ; images WebP/AVIF ; chargement différé ; pas de polices lourdes |
| Hors ligne | Formulaires stockés localement et synchronisés ; file d'envoi ; résolution de conflits |
| API | Réponses compactes, compression (gzip/brotli), pagination, requêtes groupées, reprise sur coupure |
| Vidéo | Simulcast/SVC, résolution adaptative, Opus bas débit, **repli audio automatique**, puis appel téléphonique |
| Messagerie | Texte court, audio compressé, pas d'images inutiles |

## Déroulé
1. Mesurer (Lighthouse en profil « mobile lent », WebPageTest, métriques WebRTC).
2. Comparer au budget ; identifier les plus gros postes.
3. Proposer les corrections ; ajouter un contrôle de budget dans la CI.

## Exemple [FICTIF]
> Page « Mes ordonnances » : 1,4 Mo (bibliothèque de graphiques inutilisée 600 Ko) → retrait → 280 Ko.

## Limites et interdits
- Ne jamais dégrader la sécurité (chiffrement, authentification) pour gagner du poids.
- Ne jamais mettre en cache local des données de santé sans chiffrement et durée limitée.

## Sources
- web.dev, « Performance budgets 101 » — https://web.dev/articles/performance-budgets-101
- LiveKit, documentation sur le simulcast et la qualité adaptative — https://docs.livekit.io/
- RFC 6716 (Opus) ; W3C WebRTC Statistics — https://www.w3.org/TR/webrtc-stats/
