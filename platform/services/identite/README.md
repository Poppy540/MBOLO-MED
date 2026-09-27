# Service `identite`

Authentification, rôles, **contrôle d'accès par patient** et **consentements** de Mbolo Santé (ADR-0009).

## Contenu

| Élément | Rôle |
|---|---|
| `src/acces.ts` | Point de décision d'accès au dossier d'un patient. **Refus par défaut.** |
| `src/consentements.ts` | Enregistrer, lister, révoquer un consentement (ressources FHIR `Consent` construites et vérifiées par `@mbolo/dossier-fhir`) |
| `src/depot-fhir.ts` | Stockage des consentements dans le serveur FHIR du dossier (`FHIR_BASE_URL`) : création, lecture, révocation avec verrou optimiste (`If-Match`), recherche **sans cache** pour qu'une révocation prenne effet immédiatement |
| `src/revue.ts` | Revue humaine des bris de glace : liste à revoir, retards, conclusion enregistrée (rôle `revue-acces`) |
| `src/journal-acces.ts` | Journal des accès au dossier : `AuditEvent` FHIR pour chaque décision, historique consultable par le patient |
| `src/client-fhir.ts` | Accès HTTP commun au dossier (jeton de service, délai, erreurs, pagination sans cache) |
| `src/jeton-service.ts` | Jeton du compte de service `mbolo-identite-service` (client credentials) pour la passerelle du dossier, renouvelé avant expiration (ADR-0010) |
| `src/jeton.ts` | Vérification des jetons Keycloak (signature, émetteur, audience, expiration) |
| `src/serveur.ts` | API HTTP (Fastify) : `/patients/:id/consentements`, `/consentements/:id/revocation`, `/acces/dossier` |
| `keycloak/realm-mbolo.json` | Royaume « mbolo » : rôles, clients (PKCE), protection contre la force brute, politique de mot de passe |
| `keycloak/profil-utilisateur.json` | Profil utilisateur : identifiants FHIR **modifiables par un administrateur uniquement** |
| `docker-compose.yml` | Keycloak local (comptes fictifs) |

## Règles d'accès au dossier d'un patient

| Qui | Accès | Condition |
|---|---|---|
| Patient | Son dossier | Toujours, et seulement le sien |
| Professionnel, infirmier | Dossier du patient | Consentement `C-PARTAGE-PRO` actif **qui le désigne** ; ou **bris de glace** avec motif écrit → accès accordé **et signalé** pour revue humaine |
| Proche (dont diaspora) | Dossier du patient | Consentement `C-PROCHE` actif **qui le désigne** (« payer n'est pas voir ») |
| Agent IA | Patient de sa session uniquement | Consentement `C-SOINS` actif ; pas de bris de glace |
| Pharmacien, administrateur | Aucun | Les ordonnances passeront par un service dédié |

Seul le patient (ou l'agent de sa session) peut donner, consulter ou retirer ses consentements. Une révocation prend effet immédiatement ; la ressource est conservée (`inactive`) pour la traçabilité.

## Journal des accès (principe n°3)

- **Chaque décision d'accès** (`POST /acces/dossier`), accordée ou refusée, est consignée dans le dossier du patient comme `AuditEvent` FHIR :
  - identifiant technique du demandeur et ses rôles ;
  - motif de la décision ;
  - « urgence » et justification écrite en cas de bris de glace.
- **Aucun accès n'est accordé sans trace** : si la trace ne peut pas être écrite, la réponse est **503**. Un refus reste un refus, même si sa trace échoue.
- **Les traces sont immuables** : la passerelle refuse toute modification d'un `AuditEvent`, et aucune suppression n'est possible.
- **Transparence** : `GET /patients/:id/acces` permet au patient (ou à l'agent de sa session) de voir qui a demandé l'accès à son dossier, quand, avec quel résultat et quel motif. Personne d'autre ne peut lire cet historique.

## Revue humaine des bris de glace

- **Qui peut revoir** : le rôle Keycloak `revue-acces` (relecteur des accès d'urgence), avec double authentification obligatoire et **aucun accès clinique**. Un administrateur l'attribue à la personne désignée par le porteur de projet (ex. directeur médical de garde).
- `GET /revue/bris-de-glace?statut=a-revoir|toutes` : liste des accès d'urgence accordés, les plus récents d'abord. Chaque entrée donne :
  - le patient et l'identifiant technique du demandeur ;
  - la justification écrite ;
  - **`enRetard`** si le délai de revue est dépassé.
  - Le délai est fixé par `REVUE_BRIS_DE_GLACE_DELAI_HEURES`. La valeur par défaut de **24 h est une proposition à valider** par le porteur de projet.
- `POST /revue/bris-de-glace/:traceId` enregistre la conclusion (`justifie`, `injustifie`, `a-approfondir`) et un commentaire, sous forme d'une **nouvelle trace** : la trace d'origine n'est jamais modifiée.
  - Une seule revue par accès.
  - **Personne ne revoit son propre accès d'urgence** (séparation des tâches).
  - Une conclusion `injustifie` ou `a-approfondir` produit une alerte dans le journal, pour que le responsable sécurité et le DPO donnent une suite (à relier à l'astreinte, ADR-0006).

## ⚠️ Sécurité : identifiants FHIR des comptes

Les revendications `patient_id`, `practitioner_id`, `related_person_id` du jeton déterminent **à quel dossier** un compte est rattaché. Elles doivent être **posées par un administrateur habilité** après vérification, **jamais modifiables par l'utilisateur**.

Le profil utilisateur qui l'impose (droits `edit: ["admin"]`) est **intégré au royaume** : il s'applique dès l'import, sans étape manuelle. La source lisible est `keycloak/profil-utilisateur.json`. Un test (`src/royaume.test.ts`) vérifie que le royaume en contient exactement la même version : toute modification se fait dans les deux fichiers.

## Inscription avec un code d'invitation (ADR-0014)

L'inscription passe par le **formulaire natif de Keycloak**, complété par l'extension `keycloak-extension/` (Java, SPI `form-action`, thème de connexion `mbolo`) :

- **Champs demandés** : code d'invitation, identifiant et mot de passe. Ni nom ni e-mail : `email`, `firstName` et `lastName` sont réservés à l'administrateur dans le profil utilisateur. L'identité ira dans le dossier FHIR.
- **Contrôle du code** : il est vérifié **après** les autres champs, par le service `invitations` (`POST /inscription/controle`). Les essais sont limités selon l'adresse du navigateur.
- **Utilisation du code** : il est utilisé **à la création du compte** (`POST /inscription/utilisation`, atomique). Si le service refuse, la transaction est annulée et aucun compte n'est créé.
- **Rôle attribué** : seul le rôle `patient` est donné (liste fermée). Aucun `patient_id` n'est posé : tant que l'identité n'est pas vérifiée, il n'y a ni dossier ni consultation, et l'application affiche « Votre compte est créé ».
- **Mot de passe** : il ne quitte jamais Keycloak.
- **Jeton de service** : l'extension signe elle-même un jeton de 60 s (audience `mbolo-invitations-api`, client `mbolo-keycloak-inscription`) avec la clé du royaume. Aucun secret supplémentaire n'est nécessaire.
- **En cas de doute, on refuse** : service injoignable ou réponse inattendue entraînent un refus.

### Saisie de l'identité juste après l'inscription
Action requise `mbolo-identite-patient` :
- **Formulaire « Mon identité »** : nom, prénom, date de naissance, sexe (facultatif), téléphone, numéro d'assurance maladie (facultatif).
- **Validation** : dans l'extension, avec des messages en français. Une date de naissance dans le futur est refusée.
- **Dossier** : créé au statut « à vérifier » par la passerelle (`system/Patient.c` seulement). L'extension pose ensuite `patient_id` sur le compte.
- **Journal** : le compte et la création du dossier, jamais l'identité.
- **Configuration** (variables d'environnement de Keycloak, pas des secrets) :
  - `KC_SPI_REQUIRED_ACTION_MBOLO_IDENTITE_PATIENT_DOSSIER_URL` : adresse de la passerelle, suivie de `/fhir/` ;
  - `..._ENVIRONNEMENT` : `prod` en production, sinon les dossiers portent le marqueur `fictif` ;
  - `..._IDENTIFIANT_ASSURANCE_SYSTEME` : système du numéro d'assurance du pays (Gabon : CNAMGS). Sans lui, le numéro saisi n'est pas retenu, et un professionnel attribuera un numéro provisoire.
- **Actions requises du royaume** : déclarer une action dans le royaume supprime celles qui ne sont pas déclarées. Les actions par défaut (dont `CONFIGURE_TOTP`) sont donc listées explicitement, et un test le vérifie.

### Construction et configuration
- **Construction** : `mvn -f platform/services/identite/keycloak-extension/pom.xml package` (Java 21). Les tests JUnit couvrent le client HTTP. Le jar est monté dans `/opt/keycloak/providers/` par `docker-compose.yml`.
- **Version de Keycloak** : épinglée à 26.7.4 (26.0.8 avait des failles hautes connues), identique dans `pom.xml` et `docker-compose.yml`. Toute montée de version se fait dans les deux fichiers, avec la suite e2e.
- **Adresse du service des invitations** : variable `KC_SPI_FORM_ACTION_MBOLO_CODE_INVITATION_INVITATIONS_URL`, par défaut `http://host.docker.internal:3006/` depuis le conteneur. Ce n'est pas un secret.

## MFA

Obligatoire pour **professionnel, infirmier, pharmacien, administrateur**. Ces rôles incluent le rôle technique `mfa-requise`. Le flux de connexion `navigateur-mbolo` exige alors un code à usage unique (TOTP, 6 chiffres, 30 s, code non réutilisable). À la première connexion, Keycloak impose de configurer l'application d'authentification. Les patients et les proches n'ont pas de code à saisir.

## Minimisation du jeton

Le jeton d'accès des applications ne contient **ni e-mail ni nom** : les portées `profile` et `email` sont **optionnelles**. Une application ne les demande que si l'écran en a besoin. Le jeton contient seulement le sujet, les rôles et l'identifiant FHIR rattaché.

## Commandes

```bash
pnpm --filter @mbolo/identite test     # accès, consentements, dépôt FHIR, royaume, API (jetons signés par des clés de test)
KC_BOOTSTRAP_ADMIN_PASSWORD=… IDENTITE_SERVICE_CLIENT_SECRET=… docker compose -f platform/services/identite/docker-compose.yml up -d
docker compose -f platform/services/dossier-fhir/docker-compose.yml up -d   # HAPI FHIR local (interne)
KEYCLOAK_ISSUER=http://127.0.0.1:8081/realms/mbolo FHIR_AMONT_URL=http://127.0.0.1:8080/fhir pnpm --filter @mbolo/passerelle-fhir start
KEYCLOAK_ISSUER=http://127.0.0.1:8081/realms/mbolo FHIR_BASE_URL=http://127.0.0.1:3002/fhir IDENTITE_SERVICE_CLIENT_SECRET=… pnpm --filter @mbolo/identite start
```

## Feature flags

Le partage du dossier avec un proche (`C-PROCHE`) n'est accepté que si le flag `consentement.proche` (vague 2) est actif pour le compte : sinon **403 « Fonction non disponible. »**. Les flags viennent d'Unleash (`UNLEASH_API_URL`, `UNLEASH_BACKEND_TOKEN`). Sans Unleash, toutes les fonctions nouvelles sont désactivées. Aucun flag ne touche au contrôle d'accès ni aux consentements existants (voir `docs/deploiement/flags.md`).

## Tests de bout en bout

Le royaume, le profil utilisateur et l'API sont vérifiés avec un vrai Keycloak par les scénarios de `platform/tests/features-gherkin/identite/` (`pnpm e2e`, job CI **E2E**).

## Limites (vague 0)

- Les consentements sont stockés dans le serveur FHIR si `FHIR_BASE_URL` est défini, sinon **en mémoire** (développement seulement, avec un avertissement au démarrage).
- Le dossier est joint **par la passerelle** (`FHIR_BASE_URL`), avec le jeton du compte de service : permission `system/Consent.crus`, rien d'autre (ADR-0010).
- Le service refuse de démarrer en production (vague 0).
- Si le dossier médical est indisponible, l'API répond **503**. Elle ne décide jamais d'un accès sans avoir pu lire les consentements.
- Comptes de service des agents IA (un client par agent, portée minimale) : avec l'intégration des agents.
