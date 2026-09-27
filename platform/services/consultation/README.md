# Service `consultation` (prototype)

Consultation clinique côté professionnel : **lire le dossier du patient** et **rédiger le compte-rendu** d'une téléconsultation.

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
- **Journal** : qui, quelle décision, quel compte-rendu (identifiant). **Jamais de contenu médical.**
- Un champ inconnu est refusé (400), pas ignoré.

## Configuration

| Variable | Rôle |
|---|---|
| `KEYCLOAK_ISSUER`, `CONSULTATION_AUDIENCE` (défaut `mbolo-consultation-api`) | Vérification des jetons de l'espace professionnel |
| `IDENTITE_URL` | Service `identite` (décision d'accès) |
| `FHIR_BASE_URL` | Passerelle du dossier |
| `CONSULTATION_SERVICE_CLIENT_ID` (défaut `mbolo-consultation-service`), `CONSULTATION_SERVICE_CLIENT_SECRET` | Compte de service : `system/Condition.rs system/Composition.crs system/Appointment.r` |

## Tests

- **Unitaires** : lecture seulement après décision favorable (prise avec le jeton du demandeur), refus 403 avec motif, bris de glace transmis ; compte-rendu par le médecin du rendez-vous ; refus d'un agent IA (403) ou d'un autre médecin (404), sans consentement, avant la consultation, sur un rendez-vous annulé, vide ; décision absente ou ambiguë → jamais d'accès.
- **E2E** (`features-gherkin/teleconsultation/espace-professionnel.feature`) : sans partage, le dossier reste fermé sauf accès d'urgence motivé ; avec partage, le médecin rédige le compte-rendu, retrouvé dans le dossier signé par lui.

## Reste à faire

- Le patient consulte ses comptes-rendus dans son application.
- Ordonnances électroniques (service `ordonnances`, vague 2).
