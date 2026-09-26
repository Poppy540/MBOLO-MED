# ADR-0007 — Feature flags : Unleash

- **Date :** 2026-09-26
- **Statut :** acceptée (D-0002) — précise l'outil de l'ADR-0003

## Contexte
L'ADR-0003 impose l'activation par ville, spécialité et type d'utilisateur, désactivée par défaut, journalisée, réservée à un humain habilité en production.

## Options envisagées
1. **Unleash** — open source, auto-hébergeable ou géré ; contraintes de ciblage sur des propriétés de contexte ; déploiement progressif ; journal des modifications ; rôles ; compatible OpenFeature.
2. **Flagsmith** — open source, fonctionnalités proches.
3. **GrowthBook** — orienté expérimentation (tests A/B).

## Décision
Unleash, auto-hébergé chez l'hébergeur retenu (offre gérée possible au démarrage), intégré via le SDK **OpenFeature** pour pouvoir changer d'outil sans réécrire le code.

## Conséquences
- Contexte d'évaluation : `ville`, `specialite`, `typeUtilisateur`, `vague`.
- Environnements Unleash : `dev`, `recette`, `prod` ; en `prod`, droit de modification réservé aux humains habilités.
- Plateforme : jeton **backend** (évaluation seule). Agent 6 : compte de service **lecture seule**.
- Journal des modifications conservé pour l'audit.

Sources : Unleash — https://docs.getunleash.io/ ; OpenFeature — https://openfeature.dev/
