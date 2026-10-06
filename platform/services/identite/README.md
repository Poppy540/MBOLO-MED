# Service `identite`

Authentification, rôles, **contrôle d'accès par patient** et **consentements** de Mbolo Santé (ADR-0009).

## Contenu

| Élément                            | Rôle                                                                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/acces.ts`                     | Point de décision d'accès au dossier d'un patient. **Refus par défaut.**                                                                                                                                                    |
| `src/consentements.ts`             | Enregistrer, lister, révoquer un consentement (ressources FHIR `Consent` construites et vérifiées par `@mbolo/dossier-fhir`)                                                                                                |
| `src/depot-fhir.ts`                | Stockage des consentements dans le serveur FHIR du dossier (`FHIR_BASE_URL`) : création, lecture, révocation avec verrou optimiste (`If-Match`), recherche **sans cache** pour qu'une révocation prenne effet immédiatement |
| `src/revue.ts`                     | Revue humaine des bris de glace : liste à revoir, retards, conclusion enregistrée (rôle `revue-acces`)                                                                                                                      |
| `src/journal-acces.ts`             | Journal des accès au dossier : `AuditEvent` FHIR pour chaque décision, historique consultable par le patient                                                                                                                |
| `src/client-fhir.ts`               | Accès HTTP commun au dossier (jeton de service, délai, erreurs, pagination sans cache)                                                                                                                                      |
| `src/jeton-service.ts`             | Jeton du compte de service `mbolo-identite-service` (client credentials) pour la passerelle du dossier, renouvelé avant expiration (ADR-0010)                                                                               |
| `src/jeton.ts`                     | Vérification des jetons Keycloak (signature, émetteur, audience, expiration)                                                                                                                                                |
| `src/serveur.ts`                   | API HTTP (Fastify) : `/patients/:id/consentements`, `/consentements/:id/revocation`, `/acces/dossier`                                                                                                                       |
| `keycloak/realm-mbolo.json`        | Royaume « mbolo » : rôles, clients (PKCE), protection contre la force brute, politique de mot de passe                                                                                                                      |
| `keycloak/profil-utilisateur.json` | Profil utilisateur : identifiants FHIR **modifiables par un administrateur uniquement**                                                                                                                                     |
| `docker-compose.yml`               | Keycloak local (comptes fictifs)                                                                                                                                                                                            |

## Règles d'accès au dossier d'un patient

| Qui                        | Accès                            | Condition                                                                                                                                       |
| -------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient                    | Son dossier                      | Toujours, et seulement le sien                                                                                                                  |
| Professionnel, infirmier   | Dossier du patient               | Consentement `C-PARTAGE-PRO` actif **qui le désigne** ; ou **bris de glace** avec motif écrit → accès accordé **et signalé** pour revue humaine |
| Proche (dont diaspora)     | Dossier du patient               | Consentement `C-PROCHE` actif **qui le désigne** (« payer n'est pas voir »)                                                                     |
| Agent IA                   | Patient de sa session uniquement | Consentement `C-SOINS` actif ; pas de bris de glace                                                                                             |
| Pharmacien, administrateur | Aucun                            | Les ordonnances passeront par un service dédié                                                                                                  |

Seul le patient (ou l'agent de sa session) peut donner, consulter ou retirer ses consentements. Une révocation prend effet immédiatement ; la ressource est conservée (`inactive`) pour la traçabilité. Un même consentement envoyé deux fois (réseau lent, « réessayer ») n'est enregistré qu'une fois : le consentement actif identique (catégorie, bénéficiaire, réponse, version du texte, mode) est rendu. Un retrait révoque aussi les autres consentements actifs qui ouvrent le même accès (même catégorie et même bénéficiaire, quelle que soit la version), pour que l'accès soit vraiment fermé (ASVS n°3, C10). Seule exception, étroite : l'équipe d'assistance (rôle `assistance-patient`, ADR-0019) révoque **les seuls partages `C-PROCHE`** d'un patient à sa demande (`POST /patients/:id/proches/retrait-assistance` → `{ revoques }`), sans pouvoir lire ses consentements ; appelée par le service `invitations` après le rappel du patient et le contrôle de sa date de naissance.

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

> **Thème `mbolo` et accessibilité** : `theme/mbolo/login/template.ftl` est une copie du gabarit `keycloak.v2` de Keycloak 26.7.4, avec une seule ligne modifiée : le champ qui rappelle l'identifiant (`kc-attempted-username`) reçoit un libellé (`aria-label`), absent de l'original (règle WCAG « label », relevée par le contrôle d'accessibilité des e2e). **À chaque mise à jour de Keycloak, reprendre le gabarit d'origine et remettre cette ligne.** **Faible débit** : le thème ne charge plus PatternFly (`stylesCommon` vide, `darkMode=false` dans `theme.properties`). Sur une 3G lente simulée (2 s de latence, 50 Ko/s), la page de connexion passait de 1,9 Mo et 46 s (PatternFly 1,7 Mo, image de fond, polices) à 23 Ko et 5 s. Une seule feuille, `theme/mbolo/login/resources/css/mbolo.css` (11 Ko non compressée), met en forme les classes PatternFly produites par les gabarits, avec les polices du téléphone et des caractères à la place des icônes Font Awesome ; elle place aussi à gauche du bouton l'infobulle « Recommencer la connexion » : à droite, même cachée, elle faisait défiler la page horizontalement sur un écran de 320 px (WCAG 1.4.10). Le scénario e2e `faible-debit/reseau-lent.feature` vérifie le poids et le temps d'ouverture, et les contrôles d'accessibilité des e2e vérifient les pages Keycloak (axe WCAG 2.2 AA, 320 px). **À revoir à chaque mise à jour de Keycloak** : une classe PatternFly nouvelle dans un gabarit n'aura pas de style.

> **Langue des pages** (ADR-0025) : l'application patient transmet la langue choisie par le patient (`ui_locales`, paramètre OpenID Connect). Keycloak l'applique si le royaume la propose (`supportedLocales`), sinon il affiche sa langue par défaut (`defaultLocale`, français) ; la page porte toujours la langue réellement affichée (`lang`). Seul le français est proposé aujourd'hui (`messages_en.properties`, incomplet, n'est pas activé). **Ajouter une langue validée** : (1) traduire tous les textes de `theme/mbolo/login/messages/messages_fr.properties` dans `messages_<code>.properties`, par des traducteurs humains, avec relecture par le juriste et le comité médical pour les textes sensibles (chartes, conditions, codes) ; pour une langue que Keycloak ne connaît pas (langues locales), traduire aussi ses propres textes (`messages` du thème `base`) ; (2) ajouter le code à `supportedLocales` du royaume ; (3) l'ajouter à `VITE_LANGUES` de l'application patient avec son catalogue ; (4) gabarits de SMS dans la même langue (`notifications`). Le scénario e2e `langues/choix-langue.feature` vérifie la transmission et le repli en français.

- **Champs demandés** : code d'invitation, identifiant et mot de passe. Ni nom ni e-mail : `email`, `firstName` et `lastName` sont réservés à l'administrateur dans le profil utilisateur. L'identité ira dans le dossier FHIR.
- **Contrôle du code** : il est vérifié **après** les autres champs, par le service `invitations` (`POST /inscription/controle`). Les essais sont limités selon l'adresse du navigateur.
- **Utilisation du code** : il est utilisé **à la création du compte** (`POST /inscription/utilisation`, atomique). Si le service refuse, la transaction est annulée et aucun compte n'est créé.
- **Rôle attribué** : seul le rôle `patient` est donné (liste fermée). Aucun `patient_id` n'est posé : tant que l'identité n'est pas vérifiée, il n'y a ni dossier ni consultation, et l'application affiche « Votre compte est créé ».
- **Proche invité par un patient** (ADR-0019) : le **type du code**, fixé par le service `invitations` (jamais par le formulaire), décide du rôle, dans une liste fermée (`RolesInscription` : `patient` ou `proche`, testée). Un code de proche donne le rôle `proche` et l'attribut `related_person_id` (fiche du proche, rendue par le service et vérifiée) ; aucune saisie d'identité ; la **double authentification** est configurée aussitôt (action requise `CONFIGURE_TOTP`), puis exigée à chaque connexion (le rôle `proche` inclut `mfa-requise`) ; le proche **accepte les conditions d'utilisation** (action `TERMS_AND_CONDITIONS`, jamais par défaut, texte dans le thème `mbolo` : brouillon `c-utilisation-proche-v0.1`, source `docs/securite/conditions-utilisation-proche.md`). Une réponse incohérente du service (type inconnu, proche sans fiche) annule l'inscription.
- **Mot de passe** : il ne quitte jamais Keycloak.
- **Jeton de service** : l'extension signe elle-même un jeton de 60 s (audience `mbolo-invitations-api`, client `mbolo-keycloak-inscription`) avec la clé du royaume. Aucun secret supplémentaire n'est nécessaire.
- **En cas de doute, on refuse** : service injoignable ou réponse inattendue entraînent un refus.

### Saisie de l'identité juste après l'inscription

Action requise `mbolo-identite-patient` :

- **Formulaire « Mon identité »** : nom, prénom, date de naissance, sexe (facultatif), téléphone, numéro d'assurance maladie (facultatif).
- **Validation** : dans l'extension, avec des messages en français. Une date de naissance dans le futur est refusée ; le reste de la saisie est conservé.
- **Numéro vérifié** (revue ASVS n°2, C8) : un code à 6 chiffres part au numéro saisi (`POST /codes-verification` du service `notifications`, mêmes règles que le code de connexion : 5 minutes, 3 essais, 1 envoi par minute, 10 par heure et par numéro). La page `verification-telephone.ftl` rappelle le numéro, propose « Recevoir un nouveau code » et « Corriger mon numéro » (formulaire prérempli). Tant que le code n'est pas saisi, l'identité reste dans la session d'authentification : ni compte rattaché, ni dossier. Les codes de connexion (ADR-0022) et les rappels de l'équipe (ADR-0021) vont donc à un numéro vérifié.
- **Dossier** : créé au statut « à vérifier » par la passerelle (`system/Patient.c` seulement). L'extension pose ensuite `patient_id` sur le compte.
- **Journal** : le compte et la création du dossier, jamais l'identité.
- **Configuration** (variables d'environnement de Keycloak, pas des secrets) :
  - `KC_SPI_REQUIRED_ACTION_MBOLO_IDENTITE_PATIENT_DOSSIER_URL` : adresse de la passerelle, suivie de `/fhir/` ;
  - `..._ENVIRONNEMENT` : `prod` en production, sinon les dossiers portent le marqueur `fictif` ;
  - `KC_SPI_REQUIRED_ACTION_MBOLO_IDENTITE_PATIENT_NOTIFICATIONS_URL` : adresse du service des notifications (validation du numéro) ; sans elle, aucun code ne part et l'inscription ne se termine pas ;
  - `..._IDENTIFIANT_ASSURANCE_SYSTEME` : système du numéro d'assurance du pays (Gabon : CNAMGS). Sans lui, le numéro saisi n'est pas retenu, et un professionnel attribuera un numéro provisoire.
- **Actions requises du royaume** : déclarer une action dans le royaume supprime celles qui ne sont pas déclarées. Les actions par défaut (dont `CONFIGURE_TOTP`) sont donc listées explicitement, et un test le vérifie.

### Mot de passe oublié d'un patient sans e-mail (ADR-0021)

Flux `identifiants-oublies-mbolo` (`resetCredentialsFlow`), **sans aucun e-mail** :

1. **Identifiant** du compte (étape native `reset-credentials-choose-user`).
2. **Code de l'équipe** (authentificateur `mbolo-code-recuperation`, page `code-recuperation.ftl`) : le code que l'équipe `assistance-patient` a dicté après avoir rappelé le patient au numéro de son dossier. L'extension demande au service `invitations` de l'utiliser (`POST /recuperation/utilisation`) pour le **dossier du compte** (`patient_id`, lu dans Keycloak, jamais saisi). Même message pour un identifiant inconnu, un compte sans dossier (professionnel, proche) ou un code refusé, et le service est toujours appelé : rien ne révèle si un compte existe. Les autres sessions du compte sont fermées.
3. **Nouveau mot de passe** (étape native `reset-password`) : il ne sort jamais de Keycloak.

Le patient est prévenu par SMS (`compte-recupere`), et le flag `compte.recuperation` est vérifié par le service. Configuration : `KC_SPI_AUTHENTICATOR_MBOLO_CODE_RECUPERATION_INVITATIONS_URL` (même adresse que l'inscription, pas un secret).

### Double authentification des patients (ADR-0022)

Le flux `navigateur-mbolo` a **deux niveaux** (authentification renforcée de Keycloak, `conditional-level-of-authentication`) :

- **Niveau 1** (`navigateur-mbolo niveau 1`) : mot de passe, puis OTP pour les rôles `mfa-requise` (inchangé). C'est la connexion de tous les jours ; valable 10 heures.
- **Niveau 2** (`navigateur-mbolo niveau 2`) : seulement quand l'application le demande (`acr_values=2`), juste avant une action sensible. Authentificateur `mbolo-code-sms`, page `code-sms.ftl` : un code de **6 chiffres**, envoyé au **numéro du dossier** (`patient_id`, jamais saisi) par le service `notifications` (`POST /codes-connexion`, jeton de service signé par le royaume). Code valable **5 minutes**, **3 essais**, un envoi par minute et 5 par heure dans une même session (le service des notifications limite en plus à 10 par heure et par dossier, toutes sessions confondues) ; il est gardé dans la session d'authentification sous empreinte salée, jamais en clair ni dans le journal. Le niveau 2 reste valable **15 minutes** (`loa-max-age` 900) ; le jeton porte alors `acr` = `2`.
- Un code faux ne compte **pas** comme un échec de connexion (pas de blocage du mot de passe par la protection contre la force brute) : les 3 essais suffisent. Un compte sans dossier (professionnel, proche) ne peut pas atteindre le niveau 2.
- **Services** : `acr` est lu dans le jeton (`Utilisateur.niveau`, seuls les entiers attendus). `exigerNiveau` refuse une action sensible avec `ErreurNiveauInsuffisant`, que chaque service rend en **401** `{ motif: "niveau-insuffisant" }` avec l'en-tête `WWW-Authenticate: Bearer error="insufficient_user_authentication", acr_values="2"` (RFC 9470). Ici : **accorder** un consentement `C-PARTAGE-PRO` ou `C-PROCHE` ; le refuser ou le retirer reste au niveau 1. Un agent IA n'a jamais de code SMS : il ne peut pas ouvrir le dossier à un tiers.
- Le client `mbolo-app-patient` déclare la correspondance `acr.loa.map` `{"1":1,"2":2}`. Configuration : `KC_SPI_AUTHENTICATOR_MBOLO_CODE_SMS_NOTIFICATIONS_URL` (adresse du service des notifications, pas un secret).

### Changement du numéro par le patient (ADR-0023)

Action requise `mbolo-changer-telephone`, **lancée par l'application seulement** (`kc_action=mbolo-changer-telephone`, jamais par défaut) :

1. **Code à l'ancien numéro** (celui du dossier, page `code-sms.ftl`) : un voleur de mot de passe s'arrête là.
2. **Nouveau numéro** (page `changer-telephone.ftl`), puis **code au nouveau numéro** (`verification-telephone.ftl`, « Corriger mon numéro »). Les deux codes ont leurs propres compteurs dans la session (mêmes règles que le code de connexion).
3. **Alerte à l'ancien numéro** (`POST /numero-change` du service `notifications`, avant la mise à jour : le numéro est encore dans le dossier), puis **mise à jour du seul `Patient.telecom`** par la passerelle, avec un jeton limité à cet élément (`mbolo_elements` et `mbolo_elements_modifiables` = `Patient.telecom`, `system/Patient.u`).
4. **Au plus un changement par 24 heures** (attribut `mbolo_telephone_change_le` du compte, posé par l'extension). Le patient peut toujours revenir à l'application (`cancel-aia`) ; l'application reçoit `kc_action_status` (`success`, `cancelled`).

Configuration : `KC_SPI_REQUIRED_ACTION_MBOLO_CHANGER_TELEPHONE_DOSSIER_URL` et `..._NOTIFICATIONS_URL`.

### Téléphone perdu (ADR-0023)

Action requise `mbolo-telephone-perdu`, **lancée par l'application seulement** (`kc_action=mbolo-telephone-perdu`, jamais par défaut ; niveau 1, puisque l'ancien numéro ne reçoit plus rien) :

1. **Nouveau numéro** (même page `changer-telephone.ftl`, textes « J'ai perdu mon téléphone »), puis **code au nouveau numéro** (`verification-telephone.ftl`, « Corriger mon numéro »).
2. **Demande ouverte auprès du service `documents`** (`POST /demandes-perte`, jeton de service d'audience `mbolo-documents-api`) : le numéro y est gardé chiffré. Demande déjà en cours : message, rien d'autre ; service injoignable : « réessayez ».
3. **Rien ne change dans le dossier ici** : le patient envoie ensuite de nouvelles photos depuis l'application, et une personne du rôle `verification-identite` décide (alerte à l'ancien numéro, puis numéro marqué « perte » : 24 heures sans code de connexion).

Configuration : `KC_SPI_REQUIRED_ACTION_MBOLO_TELEPHONE_PERDU_NOTIFICATIONS_URL` et `..._DOCUMENTS_URL` (en CI, le service documents écoute sur `DOCUMENTS_HOST`).

### Application d'authentification du patient (ADR-0024)

Le SMS reste le choix par défaut. Le patient qui le veut le remplace par une application gratuite (Google Authenticator, Microsoft Authenticator, FreeOTP), avec un gabarit commun `application.ftl` :

- **Activer** : action `mbolo-activer-application`, lancée par l'application avec `kc_action` **et** `acr_values=2`. L'action refuse si le niveau 2 (code SMS) n'a pas été atteint dans cette connexion (`AcrStore`) : un voleur de mot de passe ne peut pas installer sa propre application. QR code, clé lisible, premier code ; le justificatif TOTP créé est **désigné** par l'attribut `mbolo_application` (non géré, invisible et non modifiable par le patient, vérifié par `royaume.test.ts`). SMS `application-activee` au numéro du dossier.
- **Niveau 2 ensuite** : `mbolo-code-sms` demande le code de l'application et **n'accepte plus le SMS**. Seul le justificatif désigné compte : un code TOTP ajouté par l'action standard `CONFIGURE_TOTP` (possible avec le seul mot de passe) ne remplace jamais le SMS. Un code faux compte comme un échec de connexion (protection contre la force brute, comme le formulaire OTP de Keycloak). Justificatif désigné disparu : niveau 2 refusé, sans retour au SMS ; seule l'équipe peut rétablir le compte.
- **Retirer** : action `mbolo-retirer-application` (`kc_action`), un code de l'application exigé (5 essais), SMS `application-retiree`, puis justificatif et attribut retirés : retour au SMS.

Configuration : `KC_SPI_REQUIRED_ACTION_MBOLO_ACTIVER_APPLICATION_NOTIFICATIONS_URL` et `KC_SPI_REQUIRED_ACTION_MBOLO_RETIRER_APPLICATION_NOTIFICATIONS_URL`. **Application perdue** : le code de récupération de l'équipe (ADR-0021, `mbolo-code-recuperation`) retire aussi l'application (justificatif et attribut) et note la date (`mbolo_application_retiree_le`) ; pendant **24 heures**, le niveau 2 est refusé (ni code SMS ni code d'application, message Keycloak) pour que le vrai patient, prévenu par le SMS `compte-recupere`, ait le temps de réagir. Un patient sans application n'est pas concerné.

### Construction et configuration

- **Construction** : `mvn -f platform/services/identite/keycloak-extension/pom.xml package` (Java 21). Les tests JUnit couvrent le client HTTP. Le jar est monté dans `/opt/keycloak/providers/` par `docker-compose.yml`.
- **Version de Keycloak** : épinglée à 26.7.4 (26.0.8 avait des failles hautes connues), identique dans `pom.xml` et `docker-compose.yml`. Toute montée de version se fait dans les deux fichiers, avec la suite e2e.
- **Adresse du service des invitations** : variables `KC_SPI_FORM_ACTION_MBOLO_CODE_INVITATION_INVITATIONS_URL` (inscription) et `KC_SPI_AUTHENTICATOR_MBOLO_CODE_RECUPERATION_INVITATIONS_URL` (récupération du compte), par défaut `http://host.docker.internal:3006/` depuis le conteneur. Ce n'est pas un secret.

## MFA

Obligatoire pour **professionnel, infirmier, pharmacien, administrateur**. Ces rôles incluent le rôle technique `mfa-requise`. Le flux de connexion `navigateur-mbolo` exige alors un code à usage unique (TOTP, 6 chiffres, 30 s, code non réutilisable). À la première connexion, Keycloak impose de configurer l'application d'authentification. Les patients et les proches n'ont pas de code à saisir.

## Minimisation du jeton

Le jeton d'accès des applications ne contient **ni e-mail ni nom** : les portées `profile` et `email` sont **optionnelles**. Une application ne les demande que si l'écran en a besoin. Le jeton contient seulement le sujet, les rôles et l'identifiant FHIR rattaché.

## Commandes

```bash
pnpm --filter @mbolo/identite test     # accès, consentements, dépôt FHIR, royaume, API (jetons signés par des clés de test)
KC_BOOTSTRAP_ADMIN_PASSWORD=… IDENTITE_SERVICE_CERTIFICAT=… TELECONSULTATION_SERVICE_CERTIFICAT=… NOTIFICATIONS_SERVICE_CERTIFICAT=… CONSULTATION_SERVICE_CERTIFICAT=… DOCUMENTS_SERVICE_CERTIFICAT=… INVITATIONS_SERVICE_CERTIFICAT=… docker compose -f platform/services/identite/docker-compose.yml up -d
docker compose -f platform/services/dossier-fhir/docker-compose.yml up -d   # HAPI FHIR local (interne)
KEYCLOAK_ISSUER=http://127.0.0.1:8081/realms/mbolo FHIR_AMONT_URL=http://127.0.0.1:8080/fhir pnpm --filter @mbolo/passerelle-fhir start
KEYCLOAK_ISSUER=http://127.0.0.1:8081/realms/mbolo FHIR_BASE_URL=http://127.0.0.1:3002/fhir IDENTITE_SERVICE_CLE_PRIVEE=… pnpm --filter @mbolo/identite start
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

## Sécurité HTTP (revue ASVS n°1)

- Toutes les réponses portent `Cache-Control: no-store` et `X-Content-Type-Options: nosniff` (`entetesSecurite`).
- En production, les adresses des autres services, de Keycloak et du dossier doivent être en `https://` : sinon le service ne démarre pas (`exigerHttps`).
- Limites d'appels (`limiterAppels`, exporté pour tous les services, C9) : comptées par session (empreinte du jeton présenté, jamais le jeton ni son `sub` non vérifié), par adresse sans jeton, avec un plafond par adresse 20 fois plus large ; les patients derrière le NAT d'un opérateur mobile ne se bloquent pas entre eux.
- Derrière le proxy de confiance de l'hébergeur : `IDENTITE_TRUST_PROXY=true`, pour que le plafond par adresse vaille par adresse réelle (désactivé par défaut).
- Royaume Keycloak (C5) : les jetons de rafraîchissement tournent et ne servent qu'une fois (`revokeRefreshToken`, `refreshTokenMaxReuse: 0`). TLS : `MBOLO_KEYCLOAK_SSL_REQUIRED` (lu à l'import du royaume), `external` par défaut (local et CI en HTTP), **`all` en production**. Ce n'est pas un secret.
