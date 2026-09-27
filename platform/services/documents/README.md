# Service `documents` (prototype, ADR-0015)

Stockage chiffré des documents : d'abord les photos de vérification d'identité (pièce d'identité ou acte de naissance, et visage), puis, plus tard, les photos d'ordonnances et les résultats. Contenu : le cœur du service (PR AF) et **le dépôt des photos par le patient** (PR AG). L'écran du vérificateur arrive dans la PR suivante.

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
- **Limites** : 120 appels par minute et par adresse, dont 10 envois de photos.
- **Compte de service** `mbolo-documents-service` : `system/Patient.r system/Consent.s`, seul `Patient.extension` sort de la passerelle ; aucune écriture dans le dossier.
- **Suppression à échéance** : lancée au démarrage puis toutes les heures.
- **Prototype** : le service refuse de démarrer en production.

## Configuration

| Variable | Rôle |
|---|---|
| `KEYCLOAK_ISSUER`, `DOCUMENTS_AUDIENCE` (défaut `mbolo-documents-api`) | Vérification des jetons |
| `FHIR_BASE_URL`, `DOCUMENTS_SERVICE_CLIENT_ID` (défaut `mbolo-documents-service`), `DOCUMENTS_SERVICE_CLIENT_SECRET` | Lecture du statut d'identité et de la charte par la passerelle |
| `DOCUMENTS_DATABASE_URL`, `DOCUMENTS_MIGRATION_DATABASE_URL` | Base des services : rôle d'exécution et propriétaire du schéma (migrations au démarrage) |
| `DOCUMENTS_CLE_MAITRE` | Clé maître (32 octets, base64), depuis le coffre-fort |
| `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | Stockage objet ; hors production, le compartiment est créé s'il manque |
| `DOCUMENTS_VERSION_CHARTE` (défaut `0.1`) | Version de la charte en vigueur : une nouvelle version exige une nouvelle acceptation |
| `DOCUMENTS_CONSERVATION_JOURS` (défaut 90), `DOCUMENTS_MAX_PAR_TYPE` (défaut 2) | Durée de conservation (à fixer par pays avec l'avis juridique) et nombre de photos par type |
| `UNLEASH_API_URL`, `UNLEASH_BACKEND_TOKEN` | Flag `identite.photos` (sans Unleash : désactivé) |

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
- **API** (`serveur.test.ts`) : dépôt tracé sans image, refus sans charte ou après un refus, identité déjà vérifiée, agent IA et professionnel refusés, flag, contenu qui n'est pas une photo, taille, limite par type, limite d'appels.
- **E2E** (`features-gherkin/identite/verification-identite.feature`) : parcours complet dans l'application patient et refus par l'API.

En local, un SeaweedFS lancé avec `weed server -s3 -s3.config=<fichier d'identités> -volume.max=100 -master.volumeSizeLimitMB=64 -master.volumePreallocate=false` suffit (chaque compartiment de test crée 7 volumes : sans ces options, les places manquent dès la 2ᵉ exécution). Ses clés de test restent hors du dépôt.
