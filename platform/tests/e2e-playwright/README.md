# Tests de bout en bout (`@mbolo/e2e`)

Scénarios **Gherkin en français** (`platform/tests/features-gherkin/`) exécutés par **Playwright** via `playwright-bdd` (décision D-0001). Ils utilisent un **vrai Keycloak** avec le royaume `mbolo` et le **vrai service `identite`** : aucun jeton n'est fabriqué à la main.

## Données

- **Comptes fictifs uniquement** (`configuration.ts`, marqués `[FICTIF]`) : `patient-fictif-01`, `patient-fictif-02`, `medecin-fictif-01`, `infirmier-fictif-01`, `proche-fictif-01`, `pharmacien-fictif-01`.
- Recréés à chaque exécution par `preparation-globale.ts`, avec des **mots de passe aléatoires**. Ils sont transmis aux tests par l'environnement du processus et ne sont jamais écrits sur disque.
- `preparation-globale.ts` refuse de s'exécuter contre un Keycloak qui n'est pas local (`127.0.0.1` ou `localhost`).
- Un jeton obtenu est réutilisé pendant 4 minutes d'un scénario à l'autre : Keycloak refuse de réutiliser un code OTP, cela évite d'attendre la période suivante.
- Pas de trace, de vidéo ni de capture Playwright : elles contiendraient des jetons et des mots de passe de test.

## Ce qui est vérifié

| Fonctionnalité | Scénarios |
|---|---|
| `identite/connexion-keycloak.feature` | Connexion réelle par la page Keycloak avec PKCE S256 ; refus sans PKCE ; connexion directe par mot de passe désactivée ; un patient ne peut pas modifier lui-même son `patient_id` (profil utilisateur intégré au royaume) ; le jeton ne contient ni e-mail ni nom |
| `identite/double-authentification.feature` | Code à usage unique exigé pour infirmier, médecin et pharmacien (configuration imposée à la première connexion) ; aucun code pour un patient. Les codes TOTP sont calculés par `etapes/totp.ts`, avec un secret gardé en mémoire |
| `identite/acces-dossier.feature` | Refus par défaut ; accès du patient à son dossier ; partage avec un médecin puis révocation ; proche (diaspora) ; bris de glace motivé (revue humaine demandée) ou non motivé ; pharmacien sans accès clinique ; 403 et 401 (sans jeton, jeton altéré) |

## Lancer en local

```bash
# 1. Keycloak local (mot de passe administrateur choisi localement, jamais commité)
KC_BOOTSTRAP_ADMIN_PASSWORD=… docker compose -f platform/services/identite/docker-compose.yml up -d
# 2. Construire les services puis lancer les scénarios (Playwright démarre lui-même le service identite)
pnpm build
KC_BOOTSTRAP_ADMIN_PASSWORD=… pnpm e2e
```

Variables facultatives : `KEYCLOAK_URL` (défaut `http://127.0.0.1:8081`) et `IDENTITE_URL` (défaut `http://127.0.0.1:3001`).

En CI, le job **E2E** démarre Keycloak par `docker compose` avec un mot de passe administrateur **généré et masqué** à chaque exécution.

## Ajouter un scénario

1. Écrire le scénario dans `platform/tests/features-gherkin/<domaine>/*.feature` (`# language: fr`). Couvrir le cas nominal, un cas dégradé et un cas de refus ou d'escalade.
2. Réutiliser les étapes de `etapes/`, ou en ajouter (une phrase = une étape, sans logique cachée).
3. Données fictives uniquement (skill `e2e-playwright-gherkin`).
