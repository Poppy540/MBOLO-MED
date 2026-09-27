# ADR-0015 — Stockage chiffré des documents et vérification d'identité

- **Date :** 2026-09-27
- **Statut :** proposée (à valider par le porteur de projet)
- **Décideurs :** porteur de projet

## Contexte
L'ADR-0014 impose une identité vérifiée dès la vague 1 :
- deux photos : le document (pièce d'identité ou acte de naissance) **et** le visage ;
- une charte acceptée avant l'envoi (brouillon : `docs/securite/charte-verification-identite.md`) ;
- un contrôle à distance par une personne habilitée (rôle `verification-identite`, double authentification) ;
- les photos conservées comme preuve, pour une durée fixée par l'avis juridique.

Ces photos sont parmi les données les plus sensibles de la plateforme : pièce d'identité et visage. Il faut décider **où** elles sont stockées, **comment** elles sont chiffrées, **qui** peut les voir, **comment chaque accès est tracé**, et **quand elles sont supprimées**. Le même stockage servira ensuite aux documents médicaux : photos d'ordonnances et résultats (`C-PHOTOS`).

Contraintes :
- faible débit : photos compressées sur le téléphone avant l'envoi (quelques centaines de Ko) ;
- exportable : aucun service propriétaire non remplaçable (ADR-0004) ;
- aucun agent IA n'y accède ;
- un humain décide.

## Options envisagées

### Où stocker les fichiers
1. **Stockage objet compatible S3** : OVHcloud Object Storage chez l'hébergeur HDS (ADR-0004), MinIO en local et en CI. Standard, portable (tous les hébergeurs le proposent) et adapté aux fichiers.
2. **Dans la base des services** (PostgreSQL, ADR-0013), en colonne binaire. Simple pour 100 patients, mais la base grossit vite (ordonnances, résultats) et les sauvegardes s'alourdissent.
3. **Dans le dossier FHIR** (`Binary`) : des données d'identité mêlées au dossier médical, et HAPI n'est pas fait pour de gros fichiers.

### Comment chiffrer
- **A. Chiffrement par l'hébergeur seulement** (côté serveur) : protège contre le vol de disques, pas contre un accès au compartiment.
- **B. Chiffrement par la plateforme, « par enveloppe »** :
  - chaque fichier a sa propre clé (AES-256-GCM), elle-même chiffrée par une clé maître gardée hors du stockage (KMS de l'hébergeur, ou coffre-fort, ADR-0005) ;
  - une fuite du compartiment ne révèle rien ;
  - détruire la clé d'un fichier le rend illisible pour toujours (utile pour la suppression).

## Décision proposée
**Option 1 avec le chiffrement B.**

- **Nouveau service `documents`** :
  - seul détenteur des accès au stockage (`STORAGE_*`, déjà inventoriés) ;
  - il chiffre avant d'écrire et déchiffre à la lecture, avec `node:crypto` (aucune bibliothèque de chiffrement ajoutée) ;
  - client S3 : `@aws-sdk/client-s3`, **à installer avec votre accord**.
- **Métadonnées dans la base des services** (schéma `documents`, ADR-0013) :
  - identifiant, patient (référence opaque), type (`piece-identite`, `acte-naissance`, `visage`), version de la charte acceptée, dates de dépôt et de suppression prévue, clé chiffrée ;
  - jamais l'image ni le nom.
- **Charte** :
  - nouvelle catégorie de consentement **`C-IDENTITE`**, stockée dans le dossier FHIR comme les autres (`Consent`, révocable), avec la version du texte ;
  - sans elle, tout dépôt de photo est refusé ;
  - une nouvelle version de la charte exige une nouvelle acceptation.
- **Dépôt** : par le patient lui-même, depuis l'application, tant que son identité est « à vérifier » ou « refusée ». Deux photos au plus par type, compressées sur le téléphone. Seuls JPEG et PNG sont acceptés, et le format est vérifié sur le contenu, pas sur le nom.
- **Lecture** :
  - uniquement par le rôle **`verification-identite`** (double authentification), jamais par un médecin, un agent IA ou un administrateur technique ;
  - **chaque ouverture d'une photo est tracée** dans le journal des accès (`AuditEvent`, ADR-0009).
- **Décision de vérification** :
  - la personne habilitée choisit « vérifiée » (avec le numéro CNAMGS ou provisoire), « refusée » (motif codé) ou « à refaire » ;
  - le service met à jour le statut du `Patient` par la passerelle : droit de modification limité à ce statut et à l'identifiant ;
  - la décision est tracée : qui, quand, résultat ;
  - **aucune reconnaissance faciale automatique**, sous réserve de l'avis juridique.
- **Suppression automatique** :
  - à échéance, la clé du fichier est détruite, puis l'objet est supprimé ;
  - la durée est paramétrable par pays, en attendant l'avis juridique ;
  - le résultat de la vérification reste dans le dossier.
- **Écran de vérification** : dans l'**espace professionnel** existant, visible seulement avec le rôle `verification-identite`. Pas de nouvelle application à maintenir.

## Conséquences
- **Nouveaux éléments** :
  - service `documents`, stockage objet (MinIO en local et en CI), clé maître `STORAGE_KMS_KEY_REFERENCE` ;
  - rôle Keycloak `verification-identite`, catégorie `C-IDENTITE` ;
  - écrans « Vérifier mon identité » dans l'application patient et « Vérifications à faire » dans l'espace professionnel.
- **Découpage proposé en petites PR** :
  1. le service `documents` avec son chiffrement et ses tests ;
  2. l'acceptation de la charte et le dépôt des photos par le patient ;
  3. l'écran du vérificateur, sa décision et la suppression automatique.
- **À mettre à jour** :
  - registre des traitements (T9) ;
  - AIPD (données d'identité et visage : risque élevé) ;
  - modèle de menaces : vol du compartiment, abus du rôle de vérificateur, photo truquée ;
  - plan d'incident.
- **Risques** :
  - fuite du stockage : chiffrement par enveloppe, compartiment privé, accès tracés ;
  - abus d'un vérificateur : double authentification, traçabilité, revue des accès (comme les bris de glace) ;
  - photo truquée : contrôle humain, possibilité de « à refaire », et vérification en personne en dernier recours.

Sources : ADR-0004, ADR-0005, ADR-0009, ADR-0010, ADR-0013, ADR-0014 ; `docs/securite/charte-verification-identite.md` ; principes n°1, n°3, n°5 et n°7 de `CLAUDE.md` ; NIST SP 800-38D (AES-GCM).
