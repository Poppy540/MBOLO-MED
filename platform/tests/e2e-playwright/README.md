# Tests de bout en bout (`@mbolo/e2e`)

Scénarios **Gherkin en français** (`platform/tests/features-gherkin/`) exécutés par **Playwright** via `playwright-bdd` (décision D-0001). Ils utilisent un **vrai Keycloak** avec le royaume `mbolo`, un **vrai serveur HAPI FHIR**, la **vraie passerelle du dossier**, un **vrai Unleash**, un **vrai LiveKit** et le **vrai service `identite`** : aucun jeton n'est fabriqué à la main.

## Données

- **Comptes fictifs uniquement** (`configuration.ts`, marqués `[FICTIF]`) : `patient-fictif-01`, `patient-fictif-02`, `medecin-fictif-01`, `infirmier-fictif-01`, `relecteur-fictif-01`, `proche-fictif-01`, `pharmacien-fictif-01`.
- Recréés à chaque exécution par `preparation-globale.ts`, avec des **mots de passe aléatoires**. Ils sont transmis aux tests par l'environnement du processus et ne sont jamais écrits sur disque.
- `preparation-globale.ts` crée dans le serveur FHIR les `Patient`, `Practitioner` et `RelatedPerson` fictifs (marqués `fictif`). Il révoque aussi les consentements restés actifs d'une exécution précédente, sans jamais les supprimer.
- Il active le flag `consentement.proche` pour la seule cohorte de test (`patient-fictif-01`, ciblée par identifiant de compte).
- Il refuse de s'exécuter contre un Keycloak, un serveur FHIR ou un Unleash qui ne sont pas locaux (`127.0.0.1` ou `localhost`).
- Un jeton obtenu est réutilisé pendant 4 minutes d'un scénario à l'autre : Keycloak refuse de réutiliser un code OTP, cela évite d'attendre la période suivante.
- Pas de trace, de vidéo ni de capture Playwright : elles contiendraient des jetons et des mots de passe de test.

## Ce qui est vérifié

| Fonctionnalité | Scénarios |
|---|---|
| `identite/connexion-keycloak.feature` | Connexion réelle par la page Keycloak avec PKCE S256 ; refus sans PKCE ; connexion directe par mot de passe désactivée ; un patient ne peut pas modifier lui-même son `patient_id` (profil utilisateur intégré au royaume) ; le jeton ne contient ni e-mail ni nom |
| `dossier/passerelle.feature` | Le dossier n'est ouvert qu'avec un jeton de service : 401 sans jeton ou avec le jeton d'un patient ; le service `identite` lit les consentements, mais pas les autres ressources (403), ne peut pas élargir une recherche (`_include`) ni supprimer |
| `teleconsultation/visio.feature` | Le patient et le médecin du rendez-vous rejoignent une vraie salle LiveKit depuis deux navigateurs (micro simulé) et s'entendent ; personne d'autre n'entre ; fonction refusée hors cohorte ; 401 sans jeton |
| `identite/revue-bris-de-glace.feature` | Un bris de glace apparaît dans la liste à revoir du relecteur (`relecteur-fictif-01`, rôle `revue-acces`), puis en sort une fois revu ; un médecin ne peut pas consulter cette liste ; le relecteur n'a aucun accès au dossier |
| `identite/double-authentification.feature` | Code à usage unique exigé pour infirmier, médecin et pharmacien (configuration imposée à la première connexion) ; aucun code pour un patient. Les codes TOTP sont calculés par `etapes/totp.ts`, avec un secret gardé en mémoire |
| `identite/acces-dossier.feature` | Refus par défaut ; partage avec un proche refusé hors de la cohorte activée (flag `consentement.proche`) ; consentement enregistré puis révoqué **dans le dossier FHIR** (statut `active` puis `inactive`) ; partage avec un professionnel inconnu du dossier refusé ; accès du patient à son dossier ; partage avec un médecin puis révocation ; proche (diaspora) ; bris de glace motivé (revue humaine demandée) ou non motivé ; pharmacien sans accès clinique ; 403 et 401 (sans jeton, jeton altéré) |

## Lancer en local

```bash
# 1. Keycloak et HAPI FHIR locaux (mot de passe administrateur choisi localement, jamais commité)
KC_BOOTSTRAP_ADMIN_PASSWORD=… IDENTITE_SERVICE_CLIENT_SECRET=… TELECONSULTATION_SERVICE_CLIENT_SECRET=… docker compose -f platform/services/identite/docker-compose.yml up -d
docker compose -f platform/services/dossier-fhir/docker-compose.yml up -d
UNLEASH_DB_PASSWORD=… UNLEASH_ADMIN_TOKEN='*:*.…' UNLEASH_BACKEND_TOKEN='default:development.…' docker compose -f platform/services/feature-flags/docker-compose.yml up -d
# 2. Construire les services puis lancer les scénarios (Playwright démarre lui-même le service identite)
pnpm build
LIVEKIT_KEYS="<clé>: <secret>" livekit-server --config platform/services/teleconsultation/livekit/config-local.yaml &
KC_BOOTSTRAP_ADMIN_PASSWORD=… IDENTITE_SERVICE_CLIENT_SECRET=… TELECONSULTATION_SERVICE_CLIENT_SECRET=… UNLEASH_ADMIN_TOKEN=… UNLEASH_BACKEND_TOKEN=… WEBRTC_API_KEY=<clé> WEBRTC_API_SECRET=<secret> pnpm e2e
```

Variables facultatives : `KEYCLOAK_URL` (défaut `http://127.0.0.1:8081`), `FHIR_AMONT_URL` (HAPI, défaut `http://127.0.0.1:8080/fhir`), `PASSERELLE_URL` (défaut `http://127.0.0.1:3002`) et `IDENTITE_URL` (défaut `http://127.0.0.1:3001`).

En CI, le job **E2E** démarre Keycloak et HAPI FHIR par `docker compose`. Le mot de passe administrateur et le secret du compte de service sont **générés et masqués** à chaque exécution. Playwright démarre lui-même la passerelle et `identite`.

## Ajouter un scénario

1. Écrire le scénario dans `platform/tests/features-gherkin/<domaine>/*.feature` (`# language: fr`). Couvrir le cas nominal, un cas dégradé et un cas de refus ou d'escalade.
2. Réutiliser les étapes de `etapes/`, ou en ajouter (une phrase = une étape, sans logique cachée).
3. Données fictives uniquement (skill `e2e-playwright-gherkin`).
