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

## Mise en œuvre (2026-09-27, PR H)
- Paquet `@mbolo/drapeaux` : fournisseur OpenFeature maison au-dessus de `unleash-client`. Aucun fournisseur Unleash officiel n'existe pour OpenFeature côté serveur Node.
- Catalogue typé des flags, dépendances, refus par défaut (Unleash injoignable → désactivé), pas de copie sur disque.
- Ciblage de cohorte par `userId` (identifiant technique du compte) avec une contrainte : la stratégie `userWithId` n'existe plus dans Unleash 7.
- Premier flag branché : `consentement.proche` (vague 2) dans `identite`. Registre : `docs/deploiement/flags.md`.

## Unleash 8 (2026-09-27)
- **Licence** : à partir de la version 8, le code source d'Unleash passe sous **AGPLv3** (auparavant Apache 2.0). Les **images Docker officielles restent sous Apache 2.0**, et les SDK gardent leurs licences permissives.
- **Notre usage** :
  - Unleash tourne **sans modification**, uniquement pour nos équipes, pour piloter les flags ;
  - la plateforme l'utilise à travers le SDK `unleash-client` ;
  - l'AGPL n'impose de publier des modifications que si l'on modifie Unleash et qu'on le met à disposition de tiers par le réseau.
- **Règles** :
  - utiliser **l'image Docker officielle** en recette et en production ;
  - ne jamais modifier Unleash ;
  - faire confirmer ce point par le juriste avec l'avis sur les licences.
- **Compatibilité** :
  - PostgreSQL 15 minimum ; la plateforme utilise la version 16 ;
  - suppression de propriétés dépréciées depuis la version 5, que nous n'utilisons pas ;
  - suite e2e complète au vert sur 8.2.0, y compris avec une base migrée depuis la version 7.

Sources : Unleash — https://docs.getunleash.io/ ; OpenFeature — https://openfeature.dev/
