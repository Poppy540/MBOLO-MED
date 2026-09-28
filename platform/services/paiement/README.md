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

## Fournisseur simulé

- Il garde les tentatives en mémoire et ne conserve pas le numéro.
- `conclure(tentative, 'reussi' | 'echoue')` joue le payeur qui valide ou refuse sur son téléphone, et renvoie la notification signée correspondante.
- Signature : en-tête `x-signature: t=<secondes>,v1=<HMAC-SHA256 hex de "t.corps">`, clé `MOBILE_MONEY_WEBHOOK_SIGNING_SECRET`. Le vrai prestataire aura son propre format, derrière la même interface.

## Pas encore fait (PR suivantes, ADR-0017)

- Branchement au rendez-vous : créneau retenu 15 minutes, confirmation après paiement, libération en cas d'échec ; e2e.
- Écran de paiement dans l'application patient.
- Rapprochement quotidien avec le prestataire. Il rattrape les notifications perdues et une tentative ancienne confirmée après un nouvel essai.
- Remboursement validé par un humain (rôle à créer).
- Vrai fournisseur, après le contrat.

## Base de données (ADR-0013)

- Schéma `paiement`, migrations dans `migrations/`, appliquées au démarrage par le rôle de migration (`PAIEMENT_MIGRATION_DATABASE_URL`) s'il est fourni.
- Le rôle d'exécution (`PAIEMENT_DATABASE_URL`) lit, insère et met à jour. Il ne peut ni supprimer ni modifier le schéma.
- Aucune donnée de santé, aucun numéro de téléphone.

## Configuration

| Variable | Rôle |
|---|---|
| `KEYCLOAK_ISSUER`, `PAIEMENT_AUDIENCE` (défaut `mbolo-paiement-api`) | Vérification des jetons (patients et services) |
| `PAIEMENT_CLIENTS_AUTORISES` (défaut `mbolo-teleconsultation-service`) | Services qui peuvent créer un paiement et lire son statut |
| `PAIEMENT_DATABASE_URL`, `PAIEMENT_MIGRATION_DATABASE_URL` | Base (coffre-fort) |
| `MOBILE_MONEY_WEBHOOK_SIGNING_SECRET` | Signature des notifications, 32 caractères au moins (coffre-fort) |
| `PAIEMENT_DEVISE` | Devise ISO 4217 du pays, ex. `XAF` |
| `PAIEMENT_PRIX` | Grille JSON, ex. `{"generaliste":10000,"specialiste":15000}` [FICTIF : le tableur du business plan fait foi] |
| `PAIEMENT_OPERATEURS` | Opérateurs proposés, ex. `airtel,moov` |
| `PAIEMENT_INDICATIF` | Indicatif du pays sans « + », ex. `241` |
| `PAIEMENT_LIMITE_PAR_MINUTE` (défaut `300`), `PAIEMENT_COLLECTE_PAR_MINUTE` (défaut `5`) | Limites d'appels par adresse |
| `UNLEASH_API_URL`, `UNLEASH_BACKEND_TOKEN` | Flags ; sans eux, tout est désactivé |
| `PAIEMENT_TRUST_PROXY` (défaut `false`), `PORT` (défaut `3008`) | Réseau |

## Tests

`pnpm --filter @mbolo/paiement test`. Les tests PostgreSQL (`depot-postgres.test.ts`) s'exécutent si `MBOLO_TEST_DATABASE_URL` et `MBOLO_TEST_DATABASE_URL_EXECUTION` sont définies, en CI comme en local.
