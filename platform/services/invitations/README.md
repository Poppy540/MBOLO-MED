# Service `invitations` (prototype)

Accès sur invitation de la vague 1 (ADR-0013). Un humain habilité crée des codes à usage unique pour une cohorte ; un patient présente son code avant de créer son compte. **Les codes ne sont jamais conservés en clair.**

## Règles

- **Codes** : 8 caractères faciles à dicter ou à envoyer par SMS, sans caractères ambigus (ni 0/O, ni 1/I/L), présentés `ABCD-EFGH`. La saisie tolère minuscules, espaces et tirets.
- **Stockage** : seule une empreinte HMAC-SHA-256 (clé `INVITATIONS_CLE_EMPREINTE` du coffre-fort) est enregistrée, avec la cohorte, les identifiants Keycloak opaques du créateur et de l'utilisateur, et les dates. Aucune donnée de santé, aucun nom ni numéro.
- **Création, liste, révocation** : rôle `gestion-invitations` uniquement (double authentification imposée par Keycloak), jamais un agent IA (refusé même si le rôle lui était attribué par erreur).
  - `POST /invitations` `{ cohorte }` → 201 `{ id, code, cohorte, expireLe }`. Le code n'est montré qu'**une fois** (`cache-control: no-store`).
  - `GET /invitations?cohorte=…` → identifiant, dates et statut (`valide`, `utilise`, `revoque`, `expire`), jamais le code.
  - `POST /invitations/:id/revocation` → un code encore inutilisé ne peut plus servir.
- **Quota** : nombre maximal d'invitations par cohorte (révoquées comprises). Un verrou par cohorte empêche de le dépasser, même avec des créations simultanées.
- **Vérification** : `POST /invitations/verification` `{ code }` → `{ valide }`. Publique, **même réponse** pour un code inconnu, expiré, révoqué ou déjà utilisé. Limitée à `INVITATIONS_ESSAIS_MAX` essais par adresse et par fenêtre.
- **Usage unique** : `ServiceInvitations.utiliser` marque le code utilisé par un compte, de façon atomique (un même code ne sert jamais deux fois). Il sera appelé par la création de compte patient (prochaine étape).
- **Journal** : créateur, identifiant d'invitation, cohorte. **Jamais le code.**

## Base de données (ADR-0013)

- Schéma `invitations`, migrations versionnées dans `migrations/` (`NNNN-titre.sql`), appliquées au démarrage par le **rôle de migration** (`INVITATIONS_MIGRATION_DATABASE_URL`) si fourni.
- Le **rôle d'exécution** (`INVITATIONS_DATABASE_URL`) lit, insère et met à jour ; il ne peut ni supprimer ni modifier le schéma.
- En production, TLS avec vérification du certificat est imposé par `@mbolo/base-donnees`.

## Configuration

| Variable | Rôle |
|---|---|
| `KEYCLOAK_ISSUER`, `INVITATIONS_AUDIENCE` (défaut `mbolo-invitations-api`) | Vérification des jetons des gestionnaires |
| `INVITATIONS_DATABASE_URL` | Connexion du rôle d'exécution (coffre-fort) |
| `INVITATIONS_MIGRATION_DATABASE_URL` | Connexion du rôle de migration, au démarrage ou au déploiement (facultative) |
| `INVITATIONS_CLE_EMPREINTE` | Clé HMAC, 32 octets au moins (coffre-fort) ; la changer invalide les codes en cours |
| `INVITATIONS_COHORTES` | Cohortes ouvertes, séparées par des virgules (ex. une ville de la vague en cours) |
| `INVITATIONS_QUOTA_PAR_COHORTE` (défaut `100`) | Invitations par cohorte |
| `INVITATIONS_VALIDITE_JOURS` (défaut `14`) | Durée de validité d'un code (1 à 90 jours) |
| `INVITATIONS_ESSAIS_MAX` (défaut `10`), `INVITATIONS_ESSAIS_FENETRE_MINUTES` (défaut `15`) | Limite des essais de code par adresse |
| `INVITATIONS_TRUST_PROXY` (défaut `false`) | `true` derrière un proxy de confiance, pour lire l'adresse réelle du client |

Aucune valeur propre à un pays n'est codée en dur : cohortes, quota et durée sont des paramètres du déploiement.

## Tests

- **Unitaires** : alphabet et format, empreinte dépendant de la clé, code jamais stocké ni journalisé, quota, usage unique, codes expirés ou révoqués, paramètres invalides ; API (401, 403 pour un médecin ou un agent IA, cohorte fermée, champ inconnu, limitation des essais).
- **Intégration PostgreSQL** (si `MBOLO_TEST_DATABASE_URL` et `MBOLO_TEST_DATABASE_URL_EXECUTION` sont définies, toujours en CI) : migration réelle, quota et usage unique face à des requêtes simultanées, suppression refusée au rôle d'exécution.
- **E2E** (`features-gherkin/invitations/acces-sur-invitation.feature`) : création et vérification, révocation, code inventé, médecin refusé, aucun accès clinique pour le gestionnaire.

En local, un PostgreSQL 16 avec une base `mbolo` appartenant à un rôle de migration, et un rôle d'exécution distinct, suffit ; en CI, `scripts/postgres-test.sh` les crée avec des mots de passe éphémères.

## Reste à faire

- Création du compte patient à partir d'un code (appel de `utiliser`), et écran de saisie du code dans l'application patient.
- Écran de gestion des invitations (backoffice), désignation nominative de la personne de confiance.
- Limite des essais partagée entre plusieurs instances (aujourd'hui en mémoire, par instance).
