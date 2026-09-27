# Service `documents` (prototype, ADR-0015)

Stockage chiffré des documents : d'abord les photos de vérification d'identité (pièce d'identité ou acte de naissance, et visage), puis, plus tard, les photos d'ordonnances et les résultats. **Cette première étape contient le cœur du service**, sans API HTTP. La charte, le dépôt par le patient et l'écran du vérificateur arrivent dans les PR suivantes.

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
- **Nombre de photos** : au plus `maxParType` photos présentes par patient et par type.
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
  - suppression refusée au rôle d'exécution.

En local, un SeaweedFS lancé avec `weed server -s3 -s3.config=<fichier d'identités> -volume.max=100 -master.volumeSizeLimitMB=64 -master.volumePreallocate=false` suffit (chaque compartiment de test crée 7 volumes : sans ces options, les places manquent dès la 2ᵉ exécution). Ses clés de test restent hors du dépôt.
