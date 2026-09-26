# Plateforme Mbolo Santé — contexte local

> **Vague 0 : squelette uniquement, aucun code applicatif.** Le développement se fera module par module, selon les vagues (`docs/deploiement/vagues.md`) et les ADR (`docs/architecture/`).

## Structure
| Dossier | Rôle | Vague d'activation |
|---|---|---|
| `apps/patient` | Application patient (PWA mobile, faible débit, vocal, pictogrammes) | 1 |
| `apps/professionnel` | Espace des professionnels (consultation, dossier, ordonnance) | 1 |
| `apps/pharmacie` | Espace des pharmacies partenaires (ordonnances, stocks) | 2 |
| `apps/academie` | Académie Mbolo (étudiants, mentors) | 3 |
| `apps/backoffice` | Administration interne (rôles habilités, journalisé) | 0–1 |
| `services/identite` | Comptes, authentification (MFA pros), rôles, consentements | 0 |
| `services/dossier-fhir` | Seul service qui stocke les données de santé (FHIR R4, ADR-0001) : profils FSH (`ig/`), règles `@mbolo/dossier-fhir`, HAPI FHIR local — voir son README | 0 |
| `services/teleconsultation` | Salles WebRTC, jetons courts, repli audio (ADR-0002) | 1 |
| `services/ordonnances` | Ordonnances signées, vérification, transmission | 2 |
| `services/paiement` | Mobile money, carte (diaspora), statuts | 1 |
| `services/notifications` | SMS, WhatsApp, e-mail — gabarits approuvés | 1 |
| `services/feature-flags` | Activation par ville, spécialité, type d'utilisateur (ADR-0003) | 0 |
| `packages/journal-securise` | Journal JSON qui masque secrets et données de santé — **obligatoire pour tout service** | 0 |
| `tests/features-gherkin` | Scénarios Gherkin en français (`# language: fr`) | 0 |
| `tests/e2e-playwright` | Étapes Playwright, personas fictifs, profils réseau | 0 |

## Règles locales
- Socle : TypeScript strict, pnpm, ESLint, Prettier, Vitest (ADR-0008). Avant de pousser : `pnpm verifier`.
- Journalisation : uniquement via `@mbolo/journal-securise` (`console.log` interdit par le lint).
- Lire d'abord `CLAUDE.md` (racine) : principes non négociables, interdits.
- **Données de santé** : uniquement dans `services/dossier-fhir` (et stockage chiffré des documents). Les autres services ne gardent que des références.
- **Agents IA** : jamais d'accès direct à une base ; uniquement via des outils à portée minimale, journalisés, qui injectent les secrets côté serveur.
- **Secrets** : jamais dans le code ; variables décrites dans `secrets/inventaire-cles.md`, valeurs dans le coffre-fort.
- **Tests** : données fictives uniquement ; chaque fonctionnalité a ses scénarios Gherkin (nominal, dégradé, refus/escalade) ; stratégie : skill `strategie-test`.
- **Faible débit par défaut** : budgets de performance (skill `optimisation-faible-debit`).
- **Feature flags** : toute fonction nouvelle est derrière un flag désactivé par défaut.
- Langue : interface en français (puis langues locales) ; code et identifiants en anglais acceptés.
