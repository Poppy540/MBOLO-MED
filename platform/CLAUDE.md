# Plateforme Mbolo Santé — contexte local

> **Vague 0 : premiers services (`dossier-fhir`, `identite`) et premiers tests e2e ; le reste est un squelette.** Le développement se fera module par module, selon les vagues (`docs/deploiement/vagues.md`) et les ADR (`docs/architecture/`).

## Structure
| Dossier | Rôle | Vague d'activation |
|---|---|---|
| `apps/patient` | Prototype PWA (Preact + Vite, 10,3 Ko à l'ouverture) : connexion PKCE, rendez-vous, créneaux, visio avec repli audio, hors ligne ; pays paramétrable — voir son README | 1 |
| `apps/professionnel` | Prototype PWA (11,0 Ko à l'ouverture, hors ligne) : connexion avec double authentification, créneaux, rendez-vous, report, annulation, visio — voir son README | 1 |
| `apps/pharmacie` | Espace des pharmacies partenaires (ordonnances, stocks) | 2 |
| `apps/academie` | Académie Mbolo (étudiants, mentors) | 3 |
| `apps/backoffice` | Administration interne (rôles habilités, journalisé) | 0–1 |
| `services/identite` | Keycloak (royaume `mbolo`), vérification des jetons, décision d'accès au dossier, API de consentement stockée dans le dossier FHIR, bris de glace, MFA (ADR-0009) — voir son README | 0 |
| `services/dossier-fhir` | Seul service qui stocke les données de santé (FHIR R4, ADR-0001) : profils FSH (`ig/`), règles `@mbolo/dossier-fhir`, HAPI FHIR local — voir son README | 0 |
| `services/passerelle-fhir` | Seul point d'entrée des services vers le dossier FHIR : jetons de service, permissions SMART, validation des écritures (ADR-0010) — voir son README | 0 |
| `services/teleconsultation` | Prototype LiveKit (ADR-0011) : rendez-vous enregistrés dans le dossier FHIR (`Appointment`, via la passerelle), jeton de salle réservé aux deux participants, flag `teleconsultation.video` — voir son README | 1 |
| `services/consultation` | Prototype : lecture du dossier par le professionnel après décision d'`identite` (consentement, bris de glace), compte-rendu rédigé par le professionnel (`Composition`, jamais par une IA) — voir son README | 1 |
| `services/invitations` | Prototype (ADR-0013) : codes d'invitation à usage unique créés par le rôle `gestion-invitations`, empreinte HMAC (jamais le code en clair), quota par cohorte, vérification limitée ; PostgreSQL — voir son README | 1 |
| `services/ordonnances` | Ordonnances signées, vérification, transmission | 2 |
| `services/paiement` | Mobile money, carte (diaspora), statuts | 1 |
| `services/notifications` | Prototype (ADR-0012) : gabarits fermés sans donnée de santé, consentement C-RAPPELS, numéro lu dans le dossier, canal simulé en attendant le fournisseur — voir son README | 1 |
| `services/feature-flags` | Unleash local (`docker-compose.yml`, flags fictifs) ; activation par ville, spécialité, type d'utilisateur (ADR-0003, ADR-0007) | 0 |
| `packages/drapeaux` | Feature flags via OpenFeature + Unleash : catalogue désactivé par défaut, dépendances, refus en cas d'erreur — registre `docs/deploiement/flags.md` | 0 |
| `packages/journal-securise` | Journal JSON qui masque secrets et données de santé — **obligatoire pour tout service** | 0 |
| `packages/base-donnees` | Base des services (ADR-0013) : PostgreSQL, un schéma et un rôle par service, migrations versionnées, TLS vérifié en production, aucune donnée de santé | 1 |
| `packages/client-web` | Briques communes des applications web : connexion PKCE, appels d'API, dates par pays, visio LiveKit avec repli audio | 1 |
| `tests/features-gherkin` | Scénarios Gherkin en français (`# language: fr`), par domaine (`identite/`…) | 0 |
| `tests/e2e-playwright` | `@mbolo/e2e` : étapes Playwright (playwright-bdd), comptes fictifs, Keycloak, HAPI FHIR, passerelle, Unleash et LiveKit réels — `pnpm e2e`, voir son README | 0 |

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
