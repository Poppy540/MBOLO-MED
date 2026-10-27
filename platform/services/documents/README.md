# Service `documents` (prototype, ADR-0015)

Stockage chiffré des documents : d'abord les photos de vérification d'identité (pièce d'identité ou acte de naissance, et visage), puis, plus tard, les photos d'ordonnances et les résultats. Contenu : le cœur du service (PR AF), **le dépôt des photos par le patient** (PR AG) et **la vérification par une personne habilitée** (PR AH).

## Clé maître, trousseau et rotation (ADR-0016)

- **Trousseau** : chaque clé de document enveloppée commence par l'identifiant de la clé maître qui l'a protégée (`locale`, `kms:<référence>`…). La clé actuelle enveloppe ; les anciennes relisent. Les enveloppes écrites avant le trousseau (sans identifiant) sont relues par la clé locale.
- **KMS de l'hébergeur** (`CleMaitreKms`) : la clé maître ne quitte jamais le KMS ; le service lui envoie la clé de chaque document à envelopper ou désenvelopper, en TLS mutuel, avec un contexte fixe. KMS injoignable : dépôt et lecture refusés (503) et alerte `erreur-serveur` ; la téléconsultation n'en dépend pas. Format d'API retenu pour OVHcloud KMS (`/v1/servicekey/<clé>/encrypt|decrypt`) **à confronter à la documentation officielle au moment du contrat**.
- **Rotation** (humain habilité) : configurer la nouvelle clé comme actuelle et l'ancienne dans le trousseau, puis `node dist/rotation-commande.js`. Les clés des documents sont ré-enveloppées par paquets, **sans jamais déchiffrer les documents** ; une clé changée entre-temps est ignorée ; relancer la commande reprend là où elle s'est arrêtée. Retirer ensuite l'ancienne clé du coffre-fort.

## API (patient)

Jeton de l'application patient (audience `mbolo-documents-api`). Toute route, hors `/sante`, exige un jeton valide.

| Route | Rôle |
|---|---|
| `GET /verification` | État du parcours : statut d'identité, version de la charte en vigueur et acceptation, photos déjà envoyées (type et date, jamais le contenu) |
| `POST /verification/documents/:type` | Dépôt d'une photo (`piece-identite`, `acte-naissance`, `visage`), en octets bruts `image/jpeg` ou `image/png` |

Un dépôt n'est accepté que si toutes ces conditions sont réunies :
- **Compte** : celui d'un patient, pour son propre dossier. Jamais un agent IA, un proche ni un professionnel.
- **Flag `identite.photos`** : la fonction est ouverte pour ce patient. Le flag reste désactivé tant que la charte n'est pas validée.
- **Identité** : pas encore vérifiée (« à vérifier » ou « refusée »), lue dans le dossier par la passerelle.
- **Charte** : la **dernière** décision active du patient sur la charte (`C-IDENTITE`) est un accord **dans la version en vigueur** (`DOCUMENTS_VERSION_CHARTE`). Un refus plus récent, une révocation ou une ancienne version bloquent l'envoi.

La charte est acceptée **par le patient lui-même** auprès du service `identite` (catégorie `C-IDENTITE`) : un agent IA ne peut pas l'accepter à sa place.

Autres garanties :
- **Traçabilité** : chaque dépôt et chaque refus sont tracés dans le journal sécurisé (compte, dossier, type, taille, motif), sans image ni nom.
- **Limites** : 120 appels par minute et par session (jeton présenté), dont 10 envois de photos ; plafond par adresse 20 fois plus large (C9).
- **Compte de service** `mbolo-documents-service` : `system/Patient.ru system/Consent.s system/AuditEvent.c` ; seuls le nom, les prénoms, la naissance, le statut et les numéros sortent de la passerelle, et seuls le statut et les numéros peuvent être modifiés (`mbolo_elements_modifiables`).
- **Suppression à échéance** : lancée au démarrage puis toutes les heures.
- **Prototype** : le service refuse de démarrer en production.

## API (vérificateur)

Jeton de l'espace professionnel, **rôle `verification-identite`** (double authentification). Jamais un agent IA, un médecin ou un administrateur. Personne ne vérifie sa propre identité.

| Route | Rôle |
|---|---|
| `GET /verifications` | Patients dont les photos (document **et** visage) attendent une décision, depuis la dernière décision ; les plus anciens d'abord. Références opaques et dates seulement |
| `GET /verifications/:patientId` | Identité déclarée (nom, prénoms, naissance), statut, numéros, photos à examiner |
| `GET /verifications/:patientId/documents/:id` | La photo déchiffrée (`cache-control: no-store`) |
| `POST /verifications/:patientId/decision` | `verifiee` avec le numéro (assurance maladie ou provisoire), `refusee` avec un motif de la liste, ou `a-refaire` |

- **Traçabilité** : chaque consultation (identité déclarée, chaque photo) est enregistrée dans le dossier du patient (`AuditEvent`, motif `verification-identite`) **avant** d'être montrée ; sans trace, rien n'est montré. Le patient la voit dans l'historique des accès à son dossier.
- **Décision** : enregistrée dans le schéma `documents` (qui, quand, résultat, motif codé ; jamais le numéro ni de texte libre). Pour « vérifiée » et « refusée », le statut est reporté dans le dossier. La passerelle ne laisse modifier que le **statut et le numéro** : le reste du Patient est conservé.
- **« À refaire »** : les photos deviennent illisibles (clé détruite) puis sont supprimées ; le patient peut en envoyer de nouvelles.
- **Motifs de refus** (liste fermée) : `photo-illisible`, `document-non-conforme`, `visage-different`, `document-expire`, `autre-controle-en-personne`.
- **Aucune reconnaissance faciale automatique** : la comparaison est faite à l'œil (ADR-0015, sous réserve de l'avis juridique).

## Téléphone perdu (ADR-0023)

Le patient n'a plus son ancien numéro : une personne habilitée vérifie son identité avant tout changement.

| Route | Qui | Rôle |
|---|---|---|
| `POST /demandes-perte` | Extension Keycloak seule (jeton de service, clients `DOCUMENTS_APPELANTS_PERTE`) | Ouvre la demande après un code reçu au nouveau numéro (`patientId`, `telephone` au format international) ; une seule ouverte par patient (409) |
| `GET /perte` | Le patient | Demande en cours ou non, photos envoyées depuis son ouverture (type et date) |
| `GET /demandes-perte` | `verification-identite` | Demandes qui ont une photo du document **et** du visage envoyées depuis leur ouverture, les plus anciennes d'abord |
| `GET /demandes-perte/:patientId` | `verification-identite` | Identité déclarée, photos de la demande (`nouvelles`) et photos de l'inscription encore conservées (`anciennes`), à comparer ; consultation tracée dans le dossier **avant** d'être montrée. Photos : `GET /verifications/:patientId/documents/:id` |
| `POST /demandes-perte/:patientId/decision` | `verification-identite` | `acceptee`, ou `refusee` avec un motif de la liste ; jamais de texte libre |

- **Nouveau numéro chiffré** : il n'est gardé que le temps de la demande (table `documents.demandes_perte`), chiffré par une clé propre enveloppée par la clé maître, puis **effacé avec sa clé à la décision**, acceptée ou refusée. Il n'est jamais renvoyé, affiché ni journalisé. La commande de rotation ne ré-enveloppe que les photos : garder l'ancienne clé maître tant qu'une demande ouverte a été chiffrée avec elle.
- **Nouvelles photos** : acceptées même si l'identité est déjà vérifiée, tant que la demande est ouverte ; la limite par type ne compte que les photos de la demande (celles de l'inscription restent pour comparer).
- **Acceptée** : SMS d'alerte à l'**ancien** numéro par le service notifications (`POST /numero-change`, lu dans le dossier avant la mise à jour) ; **sans alerte, rien ne change** (503, réessayer). Puis `Patient.telecom` seul est remplacé par la passerelle, avec le parcours `perte` et la date (`changement-telephone`) : **aucun code de connexion pendant 24 heures**.
- **Pas de flag** : c'est une fonction de sécurité. Le dépôt des photos reste soumis à la charte `C-IDENTITE` (flag `identite.photos`).

## Dossier de candidature d'un professionnel (ADR-0026)

Pour le **professionnel candidat** seulement (rôle d'attente `professionnel-candidat`, attribut `practitioner_id`, jamais un agent IA ; 403 pour tout autre compte). Pas de flag ici : seul un compte créé avec un code d'invitation (flag `professionnels.recrutement`, service `invitations`) porte ce rôle.

- `GET /candidature` → `{ practitionerId, charte: { version, acceptee }, pieces: [{ type, deposeLe }] }` : jamais le contenu d'une pièce.
- `POST /candidature/charte` `{ version, accepte }` → 204 : accord ou refus de la charte `C-VERIFICATION-PRO` (brouillon `docs/securite/charte-verification-professionnels.md`, version `DOCUMENTS_VERSION_CHARTE_PRO`), par le candidat lui-même ; une ancienne version est refusée (409). Chaque décision est gardée (table `chartes_professionnels`), la dernière fait foi.
- `POST /candidature/pieces/:type` (octets bruts JPEG ou PNG, 2 Mo au plus) → 201 : `diplome`, `inscription-ordre`, `piece-identite`, `assurance-rcp`. Exige la charte acceptée dans la version en vigueur (409 sinon) ; format reconnu sur le contenu (415) ; au plus `DOCUMENTS_PIECES_MAX_PAR_TYPE` pièces par type (409, compté sous verrou). Même chiffrement par enveloppe que les photos des patients (table `pieces_professionnels`, sans image ni nom), même rotation de la clé maître, suppression à échéance par destruction de la clé (`DOCUMENTS_PIECES_CONSERVATION_JOURS`, 730 jours en attendant la décision du juriste, ADR-0026 question 5).
- Journal : compte, fiche, type, taille ; jamais le contenu ni le nom.
- La consultation des pièces par le rôle `verification-professionnels` viendra avec l'écran de vérification (ADR-0026, PR 4).

## Configuration

| Variable | Rôle |
|---|---|
| `KEYCLOAK_ISSUER`, `DOCUMENTS_AUDIENCE` (défaut `mbolo-documents-api`) | Vérification des jetons |
| `FHIR_BASE_URL`, `DOCUMENTS_SERVICE_CLIENT_ID` (défaut `mbolo-documents-service`), `DOCUMENTS_SERVICE_CLE_PRIVEE` (clé privée, `private_key_jwt`, ADR-0016) | Lecture du statut d'identité et de la charte par la passerelle |
| `DOCUMENTS_DATABASE_URL`, `DOCUMENTS_MIGRATION_DATABASE_URL` | Base des services : rôle d'exécution et propriétaire du schéma (migrations au démarrage) |
| `DOCUMENTS_CLE_MAITRE` (et `DOCUMENTS_CLE_MAITRE_ID`, défaut `locale`) | Clé maître locale (32 octets, base64), depuis le coffre-fort ; clé actuelle tant que le KMS n'est pas configuré, puis lecture des anciennes enveloppes |
| `DOCUMENTS_KMS_URL`, `STORAGE_KMS_KEY_REFERENCE`, `DOCUMENTS_KMS_CERTIFICAT`, `DOCUMENTS_KMS_CLE_PRIVEE`, `DOCUMENTS_KMS_AUTORITE` (facultatif) | Clé maître dans le KMS de l'hébergeur (ADR-0016), en TLS mutuel ; si `DOCUMENTS_KMS_URL` est défini, elle devient la clé actuelle |
| `DOCUMENTS_CLES_MAITRES_ANCIENNES` | Anciennes clés locales (« id:base64,… »), le temps d'une rotation |
| `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | Stockage objet ; hors production, le compartiment est créé s'il manque |
| `DOCUMENTS_SYSTEME_ASSURANCE`, `DOCUMENTS_SYSTEME_PROVISOIRE` | Système (URI) des numéros d'assurance maladie et provisoires : dépend du pays |
| `DOCUMENTS_VERSION_CHARTE` (défaut `0.1`) | Version de la charte en vigueur : une nouvelle version exige une nouvelle acceptation |
| `DOCUMENTS_CONSERVATION_JOURS` (défaut 90), `DOCUMENTS_MAX_PAR_TYPE` (défaut 2) | Durée de conservation (à fixer par pays avec l'avis juridique) et nombre de photos par type |
| `DOCUMENTS_VERSION_CHARTE_PRO` (défaut `c-verification-pro-v0.1`), `DOCUMENTS_PIECES_CONSERVATION_JOURS` (défaut 730), `DOCUMENTS_PIECES_MAX_PAR_TYPE` (défaut 2) | Charte et pièces des professionnels candidats (ADR-0026) |
| `UNLEASH_API_URL`, `UNLEASH_BACKEND_TOKEN` | Flag `identite.photos` (sans Unleash : désactivé) |
| `NOTIFICATIONS_URL`, `DOCUMENTS_APPELANTS_PERTE` (défaut `mbolo-keycloak-inscription`) | Téléphone perdu (ADR-0023) : alerte à l'ancien numéro, et clients autorisés à ouvrir une demande ; sans `NOTIFICATIONS_URL`, les routes « perte » ne sont pas ouvertes |

## Chiffrement par enveloppe
- **Une clé par document** : chaque document a sa propre clé AES-256-GCM, tirée au hasard.
- **Clé maître** : la clé du document est chiffrée (« enveloppée ») par une clé maître gardée hors du stockage. Aujourd'hui, `CleMaitreLocale` lit une clé de 32 octets depuis le coffre-fort ; en production, le KMS de l'hébergeur (`STORAGE_KMS_KEY_REFERENCE`) prendra le relais, avec la même interface.
- **Lien au document** : l'identifiant du document est lié au contenu chiffré (données authentifiées). Un contenu échangé avec celui d'un autre document, ou altéré, est refusé.
- **Aucune bibliothèque de chiffrement ajoutée** : uniquement `node:crypto`.

## Stockage
- **Contenus chiffrés** : stockage objet compatible S3 (`StockageS3`, client `@aws-sdk/client-s3`) : OVHcloud en production, SeaweedFS 4.47 en local et en CI. Le nom d'un objet est l'identifiant du document, sans nom de patient ni type.
- **Métadonnées** : base des services, schéma `documents` (migration `0001-documents.sql`) : patient (référence opaque), type, format, taille, version de la charte, clé enveloppée, dates. Jamais d'image.

## Règles
- **Types admis** : `piece-identite`, `acte-naissance`, `visage`.
- **Formats** : JPEG ou PNG, reconnus au contenu (pas au nom).
- **Taille** : 2 Mo au plus.
- **Nombre de photos** : au plus `maxParType` photos présentes par patient et par type. Compter puis insérer se fait **sous verrou** (par patient et par type) : deux envois simultanés ne dépassent pas la limite.
- **Suppression à échéance** (`supprimerEchus`), après `conservationJours` jours (durée à fixer avec l'avis juridique) :
  - la **clé est détruite d'abord** : le contenu devient illisible même si l'effacement de l'objet échouait ;
  - l'objet est ensuite supprimé ;
  - la ligne de métadonnées reste comme trace, sans clé. Le rôle d'exécution ne peut rien supprimer en base.
- **Échec d'enregistrement** : si les métadonnées ne peuvent pas être enregistrées, le contenu chiffré est retiré.

## Tests
- **Unitaires** :
  - aller-retour du chiffrement ;
  - refus avec une autre clé maître, pour un autre document ou d'un contenu altéré ;
  - une clé différente par document ;
  - formats reconnus (PDF et SVG refusés) ;
  - taille, type, nombre maximal ;
  - suppression à échéance ;
  - aucune image en clair dans le stockage ni dans les métadonnées.
- **Intégration** (vrai PostgreSQL et vrai S3, si les variables `MBOLO_TEST_DATABASE_URL`, `MBOLO_TEST_DATABASE_URL_EXECUTION` et `MBOLO_TEST_S3_URL`, `MBOLO_TEST_S3_CLE`, `MBOLO_TEST_S3_SECRET` sont définies ; toujours en CI avec `scripts/postgres-test.sh` et `scripts/s3-test.sh`) :
  - dépôt, relecture, suppression à échéance, trace sans clé ;
  - suppression refusée au rôle d'exécution ;
  - cinq envois simultanés : deux seulement acceptés.
  - demande « perte » : une seule ouverte par patient même pour deux ouvertures simultanées, refus sans motif rejeté par la base, numéro effacé à la clôture.
- **API** (`serveur.test.ts`) : dépôt tracé sans image, refus sans charte ou après un refus, identité déjà vérifiée, agent IA et professionnel refusés, flag, contenu qui n'est pas une photo, taille, limite par type, limite d'appels.
- **API du vérificateur** : liste réservée au rôle, traces avant affichage, photo d'un autre patient refusée, pas d'auto-vérification, « vérifiée » avec numéro, motif obligatoire et sans texte libre, « à refaire ».
- **Téléphone perdu** (`perte.test.ts`) : ouverture par l'extension Keycloak seule, une à la fois, numéro chiffré et jamais journalisé ; nouvelles photos malgré une identité vérifiée, limite comptée sur la demande ; fiche tracée ; alerte à l'ancien numéro avant la mise à jour ; nouveau numéro avec le parcours `perte` ; sans alerte, rien ne change ; refus avec motif ; numéro effacé ; pas d'auto-vérification ni d'agent IA. Le parcours de bout en bout (Keycloak, application, espace professionnel) arrive avec la PR suivante.
- **E2E** (`features-gherkin/identite/verification-identite.feature`, `verification-par-un-humain.feature`) : parcours du patient, puis vérification dans l'espace professionnel (photos affichées, statut et numéro dans le dossier, consultations visibles par le patient), « à refaire », motif obligatoire, médecin refusé.

En local, un SeaweedFS lancé avec `weed server -volume.port=8090 -s3 -s3.config=<fichier d'identités> -volume.max=100 -master.volumeSizeLimitMB=64 -master.volumePreallocate=false` suffit (chaque compartiment de test crée 7 volumes : sans ces options, les places manquent dès la 2ᵉ exécution). Ses clés de test restent hors du dépôt.
