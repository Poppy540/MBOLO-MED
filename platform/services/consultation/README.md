# Service `consultation` (prototype)

Consultation clinique : côté professionnel, **lire le dossier du patient**, **rédiger le compte-rendu** et **prescrire** ; côté patient, **lire ses comptes-rendus et ses ordonnances**.

## Règles

- **Aucune décision d'accès ici.** Avant toute lecture ou écriture, le service demande la décision au service `identite` (`POST /acces/dossier`) **avec le jeton de la personne qui demande**. `identite` applique les consentements (`C-PARTAGE-PRO`), le bris de glace motivé, et **consigne chaque décision** dans le dossier (`AuditEvent`). Sans réponse claire d'`identite`, l'accès est refusé (503).
- **`POST /dossiers/lecture`** (`patientId`, `brisDeGlace.motif` facultatif) :
  - refus → 403 avec le motif ;
  - sinon, résumé du dossier : problèmes de santé (déclarés ou posés par un professionnel) et comptes-rendus.
- **`POST /rendez-vous/:id/compte-rendu`** (`motif`, `observations`, `conclusion`, `conduiteATenir`, 4 000 caractères au plus chacun, au moins un non vide) :
  - rédigé par le **professionnel du rendez-vous**, jamais par un agent IA ni un autre professionnel (404 sans rien révéler) ;
  - à partir de l'ouverture de la salle (15 min avant), rendez-vous non annulé ;
  - même décision d'accès que la lecture ;
  - enregistré comme `Composition` FHIR (profil `mbolo-compte-rendu`, invariant `mbolo-cr-1` : auteur = un seul `Practitioner`), rattaché au rendez-vous.
- **Ordonnance électronique** (ADR-0018, proposée, suspendue à l'avis juridique ; flag `ordonnances.electroniques`, vague 2) :
  - **`POST /rendez-vous/:id/ordonnance`** (`lignes` de 1 à 10, `renouvellements` de 0 à 12) : chaque ligne est **structurée** (médicament codé dans la nomenclature du pays, dose en unité UCUM, fréquence, durée en jours) ; **aucun champ de texte libre** ;
  - prescrite par le **professionnel du rendez-vous** seulement, jamais par un agent IA ni un patient, avec les mêmes conditions que le compte-rendu (salle ouverte, rendez-vous non annulé, décision d'accès) ;
  - enregistrée comme `MedicationRequest` FHIR (profil `mbolo-ordonnance`), une ressource par ligne, le numéro `ORD-…` en `identifier` et `groupIdentifier` ; validité par défaut `CONSULTATION_VALIDITE_ORDONNANCE_JOURS` ;
  - si une ligne ne peut pas être écrite, celles déjà écrites passent en `entered-in-error` : jamais d'ordonnance incomplète utilisable ;
  - **`GET /ordonnances/:numero`** et **`POST /ordonnances/:numero/revocation`** : par le prescripteur seul (un autre reçoit 404), révocation tant que l'ordonnance est active ; possibles même si le flag est refermé ;
  - la signature du prescripteur et la délivrance en pharmacie viendront après l'avis juridique.
- **`GET /mes-documents`** : le **patient lui-même** (ni proche ni agent IA pour l'instant) lit ses comptes-rendus et ses ordonnances, les plus récents d'abord :
  - même décision d'accès par `identite` que toute lecture du dossier, donc **tracée** (`AuditEvent`, motif `patient-lui-meme`) et visible dans son historique des accès ;
  - texte exactement tel que le professionnel l'a écrit, jamais résumé ni reformulé par une IA ;
  - comptes-rendus et lignes d'ordonnance écrits par erreur (`entered-in-error`) exclus ; ordonnance révoquée montrée comme telle ; fréquence structurée (chaque application la formule dans la langue du pays).
- **Journal** : qui, quelle décision, quel compte-rendu ou quelle ordonnance (identifiant, nombre de lignes). **Jamais de contenu médical** (ni médicament ni posologie).
- Un champ inconnu est refusé (400), pas ignoré.

## Configuration

| Variable | Rôle |
|---|---|
| `KEYCLOAK_ISSUER`, `CONSULTATION_AUDIENCE` (défaut `mbolo-consultation-api`) | Vérification des jetons de l'espace professionnel |
| `IDENTITE_URL` | Service `identite` (décision d'accès) |
| `FHIR_BASE_URL` | Passerelle du dossier |
| `UNLEASH_API_URL`, `UNLEASH_BACKEND_TOKEN` | Flags ; sans eux, la prescription est fermée |
| `CONSULTATION_NOMENCLATURE_MEDICAMENTS` (défaut ATC `http://www.whocc.no/atc`), `CONSULTATION_VALIDITE_ORDONNANCE_JOURS` (défaut `90`, à confirmer) | Nomenclature des médicaments et validité des ordonnances du pays déployé |
| `CONSULTATION_SERVICE_CLIENT_ID` (défaut `mbolo-consultation-service`), `CONSULTATION_SERVICE_CLE_PRIVEE` (clé privée, `private_key_jwt`, ADR-0016) | Compte de service : `system/Condition.rs system/Composition.crs system/Appointment.r system/MedicationRequest.crus` (ordonnances, ADR-0018) |

## Tests

- **Unitaires** : lecture seulement après décision favorable (prise avec le jeton du demandeur), refus 403 avec motif, bris de glace transmis ; compte-rendu par le médecin du rendez-vous ; refus d'un agent IA (403) ou d'un autre médecin (404), sans consentement, avant la consultation, sur un rendez-vous annulé, vide ; décision absente ou ambiguë → jamais d'accès.
- **Unitaires, ordonnances** : prescription par le médecin du rendez-vous (lignes valides, même numéro, validité) ; refus d'un agent IA, d'un patient, d'un autre médecin, fonction fermée, sans accès ; médicament hors nomenclature ; écriture interrompue ; relecture et révocation par le seul prescripteur, une seule fois, même flag refermé.
- **E2E** (`features-gherkin/teleconsultation/espace-professionnel.feature`) : sans partage, le dossier reste fermé sauf accès d'urgence motivé ; avec partage, le médecin rédige le compte-rendu, retrouvé dans le dossier signé par lui.
- **Unitaires, mes documents** : le patient lui-même, décision prise avec son jeton ; rien d'écrit par erreur ; ordonnance révoquée signalée ; refus d'un professionnel, d'un agent IA, d'un patient sans dossier, décision défavorable.
- **E2E mes documents** (`features-gherkin/dossier/mes-documents.feature`) : dans l'application patient, compte-rendu et ordonnance de la consultation, puis ordonnance annulée ; lecture tracée dans l'historique ; refus d'un médecin et sans jeton.
- **E2E ordonnances** (`features-gherkin/ordonnances/prescription.feature`) : prescription retrouvée dans le dossier (prescripteur, médicament codé, aucun texte libre), puis révocation ; refus sans partage du dossier ; un patient ne prescrit ni ne révoque.

## Reste à faire

- Un proche autorisé (`C-PROCHE`) lit les documents du patient.
- Ordonnances : signature du prescripteur, choix de la pharmacie, code de retrait et délivrance (service `ordonnances`, ADR-0018), après l'avis juridique.
