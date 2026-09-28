# Service `paiement` (prototype)

Paiement des consultations par mobile money (ADR-0017, **proposée**). Le prestataire n'est pas encore choisi : le service parle à une interface `Fournisseur`, et seul un **fournisseur simulé** existe. Le service refuse de démarrer en production avec lui.

## Règles

- **Montant fixé par le serveur** : il vient de la grille du pays déployé (`PAIEMENT_PRIX`, `PAIEMENT_DEVISE`) et du type de consultation. Il n'est jamais reçu d'un navigateur ni d'un autre service : un champ `montant` dans la requête est refusé (400).
- **Création** : `POST /paiements` `{ reference, sujet, type }` → 201 `{ id, statut, montant, devise }`.
  - Réservé aux services autorisés : jeton de service, audience `mbolo-paiement-api`, client dans `PAIEMENT_CLIENTS_AUTORISES`, d'abord `mbolo-teleconsultation-service`.
  - `reference` est l'identifiant opaque du rendez-vous et `sujet` le compte Keycloak du patient.
  - La création est idempotente : un seul paiement par rendez-vous, même en simultané. Une référence déjà liée à un patient n'est jamais rattachée à un autre (403).
- **Statut pour la téléconsultation** : `GET /rendez-vous/:reference/paiement` → `{ paye }`, rien d'autre (même jeton de service).
- **Collecte** : `POST /paiements/:id/collecte` `{ operateur, numero }` → 202 `{ statut: "en-attente", … }`.
  - Réservée au patient concerné : rôle `patient`, **jamais un agent IA**. Un autre compte reçoit 404.
  - Le numéro peut être celui d'un proche. Il doit être au format international du pays (`PAIEMENT_INDICATIF`).
  - Le numéro est transmis au prestataire, **ni stocké ni journalisé**.
  - Une seule collecte à la fois (409 `deja-en-cours`) ; jamais sur un paiement déjà payé (409 `deja-paye`).
  - Chaque essai porte une nouvelle tentative (UUID), qui sert de clé d'idempotence chez le prestataire.
  - Au plus `PAIEMENT_COLLECTE_PAR_MINUTE` essais par minute : chaque essai sollicite le téléphone du payeur.
- **Libellé chez le prestataire** : « Consultation Mbolo Santé ». Jamais la spécialité, le professionnel ni le patient.
- **Confirmation** : un paiement n'est « payé » que si le prestataire le confirme **quand on relit son statut**.
  - La notification du prestataire (`POST /notifications/prestataire`) n'est qu'un signal : signature vérifiée sur les octets reçus, horodatage à 5 minutes au plus (rejeu refusé), puis statut relu.
  - Une notification non signée est refusée (401) et journalisée.
  - `GET /paiements/:id`, pour le patient, relit aussi le statut tant que la collecte est en attente.
- **Prestataire injoignable** : 503 et alerte `erreur-serveur`. La tentative passe à « échoué » et le patient peut réessayer.
- **Flag `paiement.mobile-money`** : désactivé par défaut. Fermé, la création et la collecte sont refusées (403 `desactive`).
- **Journal** : compte, identifiant du paiement, opérateur, statut. **Jamais le numéro.**

Statuts : `a-payer` → `en-attente` → `paye` ou `echoue` (un paiement échoué peut être retenté).

## Annulation, rapprochement et remboursement

- **Annulation** : `POST /rendez-vous/:reference/annulation` (jeton de service de la téléconsultation) → `{ connu, aRembourser }`.
  - Plus aucune collecte pour ce rendez-vous (409 `annule`, aussi face à une collecte simultanée).
  - Si le paiement est déjà reçu, ou arrive plus tard, un **remboursement est préparé** (un seul par paiement) et les valideurs sont prévenus (alerte `remboursement-a-valider`).
- **Rapprochement** (toutes les 15 min par défaut) :
  - les collectes en attente sont relues chez le prestataire, pour rattraper une notification perdue ;
  - les paiements reçus pour un rendez-vous annulé sont mis en remboursement ;
  - les remboursements validés mais pas encore versés (prestataire injoignable) sont exécutés.
- **Décision humaine** (rôle `validation-remboursement`, double authentification, jamais un agent IA, jamais sur son propre paiement) :
  - `GET /remboursements` → remboursements à valider : montant, devise, date, référence opaque du rendez-vous, opérateur. Jamais le patient ni le numéro.
  - `POST /remboursements/:id/decision` `{ decision: "valide" | "refuse" }` → **aucun texte libre**. Une décision ne se prend qu'une fois (409 `deja-decide`).
  - Validé : le prestataire rend l'argent au portefeuille qui a payé (Mbolo Santé ne connaît pas le numéro), avec l'identifiant du remboursement comme clé d'idempotence.
  - Qui a décidé et quand est conservé ; le journal trace la décision et le montant.
- **Règles de remboursement** : décision du porteur de projet (ADR-0017). La plateforme prépare seulement le cas « payé mais rendez-vous annulé » ; le valideur décide selon ces règles.

## Reçus et avoirs (ADR-0020, flag `facturation.recus`)

- **Émission** : un **reçu** à chaque paiement confirmé, un **avoir** à chaque remboursement versé ; un seul de chaque par paiement (un nouvel essai rend celui qui existe). Un échec n'empêche jamais le paiement ni le remboursement : le rapprochement périodique émet ce qui manque.
- **Numérotation** continue, **sans trou**, par pays et par année du pays (fuseau, pas UTC) : `GA-2026-000001` [FICTIF]. Le compteur et le reçu sont écrits dans la même transaction, sous verrou par paiement ; le rôle d'exécution ne peut rien supprimer.
- **Contenu** : libellé neutre « Consultation Mbolo Santé » (ou « Remboursement — … »), montant, devise, date, référence opaque du rendez-vous, opérateur ; pour un avoir, le numéro du reçu annulé ; émetteur et mentions du déploiement. **Ni numéro de téléphone, ni donnée de santé, ni nom du professionnel.**
- **Pas encore** : ventilation honoraires / frais de service, taxes, mentions légales définitives (questions du juriste et du comptable, ADR-0020). En attendant, chaque reçu porte `valeurFiscale: false`.
- **Lecture** : `GET /recus` (patient lui-même, jamais un agent IA ni un professionnel) → `{ recus }` (`cache-control: no-store`) ; fonction fermée : 403 `desactive`.

## Relevés des professionnels (ADR-0020, flag `reversements.professionnels`)

- Chaque paiement retient la **référence opaque du professionnel** du rendez-vous (`praticien`, envoyée par la téléconsultation) ; jamais son nom ni sa spécialité. Les paiements antérieurs n'en ont pas et restent hors relevé.
- `GET /releves?mois=AAAA-MM` (rôle `validation-reversement`, double authentification, jamais un agent IA) → par professionnel et par devise : consultations payées et montant encaissé dans le mois, remboursements versés dans le mois, **net**, **part à reverser** (arrondie à l'unité inférieure) et, si le net est négatif, montant **à déduire** du relevé suivant. Le mois commence et finit à minuit **dans le pays** (fuseau).
- **Lecture seule : rien n'est versé.** Le versement (validation par un humain, coordonnées de versement vérifiées et chiffrées) viendra après les réponses du porteur de projet et du juriste.
- Part reversée : `PAIEMENT_PART_REVERSEE_POURCENT` (défaut `55`, hypothèse du business plan, à valider : partage d'honoraires, ADR-0020 questions 1 et 11).

## Fournisseur simulé

- Il garde les tentatives en mémoire et ne conserve pas le numéro.
- `conclure(tentative, 'reussi' | 'echoue')` joue le payeur qui valide ou refuse sur son téléphone, et renvoie la notification signée correspondante.
- Signature : en-tête `x-signature: t=<secondes>,v1=<HMAC-SHA256 hex de "t.corps">`, clé `MOBILE_MONEY_WEBHOOK_SIGNING_SECRET`. Le vrai prestataire aura son propre format, derrière la même interface.

## Simulation du payeur (développement et e2e)

Avec `PAIEMENT_SIMULATION=true` (jamais en production : le service refuse d'y démarrer), `POST /simulation/paiements/:id/conclusion` `{ resultat: "reussi" | "echoue" }` joue le payeur qui valide ou refuse sur son téléphone. La conclusion passe par le même chemin qu'un vrai prestataire : notification signée, puis statut relu. Sans la variable, la route n'existe pas.

## Branchement au rendez-vous

Le service `teleconsultation` crée le paiement à la réservation et demande « payé ou non » (voir son README). Scénarios de bout en bout : `platform/tests/features-gherkin/paiement/reservation-payante.feature`.

## Pas encore fait (PR suivantes, ADR-0017)

- Écran de paiement dans l'application patient ; écran des remboursements dans l'espace professionnel (l'API existe).
- Tentative ancienne confirmée après un nouvel essai : à rapprocher avec l'export du vrai prestataire.
- Vrai fournisseur, après le contrat.

## Base de données (ADR-0013)

- Schéma `paiement`, migrations dans `migrations/`, appliquées au démarrage par le rôle de migration (`PAIEMENT_MIGRATION_DATABASE_URL`) s'il est fourni.
- Le rôle d'exécution (`PAIEMENT_DATABASE_URL`) lit, insère et met à jour. Il ne peut ni supprimer ni modifier le schéma.
- Aucune donnée de santé, aucun numéro de téléphone.

## Configuration

| Variable                                                                                               | Rôle                                                                                                                      |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `KEYCLOAK_ISSUER`, `PAIEMENT_AUDIENCE` (défaut `mbolo-paiement-api`)                                   | Vérification des jetons (patients et services)                                                                            |
| `PAIEMENT_CLIENTS_AUTORISES` (défaut `mbolo-teleconsultation-service`)                                 | Services qui peuvent créer un paiement et lire son statut                                                                 |
| `PAIEMENT_DATABASE_URL`, `PAIEMENT_MIGRATION_DATABASE_URL`                                             | Base (coffre-fort)                                                                                                        |
| `MOBILE_MONEY_WEBHOOK_SIGNING_SECRET`                                                                  | Signature des notifications, 32 caractères au moins (coffre-fort)                                                         |
| `PAIEMENT_DEVISE`                                                                                      | Devise ISO 4217 du pays, ex. `XAF`                                                                                        |
| `PAIEMENT_PRIX`                                                                                        | Grille JSON, ex. `{"generaliste":10000,"specialiste":15000}` [FICTIF : le tableur du business plan fait foi]              |
| `PAIEMENT_OPERATEURS`                                                                                  | Opérateurs proposés, ex. `airtel,moov`                                                                                    |
| `PAIEMENT_INDICATIF`                                                                                   | Indicatif du pays sans « + », ex. `241`                                                                                   |
| `PAIEMENT_LIMITE_PAR_MINUTE` (défaut `300`), `PAIEMENT_COLLECTE_PAR_MINUTE` (défaut `5`)               | Limites d'appels par adresse                                                                                              |
| `UNLEASH_API_URL`, `UNLEASH_BACKEND_TOKEN`                                                             | Flags ; sans eux, tout est désactivé                                                                                      |
| `PAIEMENT_TRUST_PROXY` (défaut `false`), `PORT` (défaut `3008`)                                        | Réseau                                                                                                                    |
| `PAIEMENT_RAPPROCHEMENT_INTERVALLE_MS` (défaut `900000`)                                               | Fréquence du rapprochement avec le prestataire                                                                            |
| `PAIEMENT_RECUS_PAYS` (défaut `GA`), `PAIEMENT_RECUS_FUSEAU` (défaut `Africa/Libreville`)              | Série des reçus : code pays et année du pays                                                                              |
| `PAIEMENT_RECUS_EMETTEUR`, `PAIEMENT_RECUS_MENTIONS`, `PAIEMENT_RECUS_VALEUR_FISCALE` (défaut `false`) | Émetteur et mentions des reçus, validés par le juriste ; `true` seulement après validation par le juriste et le comptable |
| `PAIEMENT_PART_REVERSEE_POURCENT` (défaut `55`)                                                        | Part reversée au professionnel dans les relevés, en pourcentage entier                                                    |
| `PAIEMENT_SIMULATION` (défaut absent)                                                                  | `true` : route de simulation du payeur (développement et e2e seulement)                                                   |

## Tests

`pnpm --filter @mbolo/paiement test`. Les tests PostgreSQL (`depot-postgres.test.ts`) s'exécutent si `MBOLO_TEST_DATABASE_URL` et `MBOLO_TEST_DATABASE_URL_EXECUTION` sont définies, en CI comme en local.
