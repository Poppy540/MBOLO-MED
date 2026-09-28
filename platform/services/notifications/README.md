# Service `notifications` (prototype)

Prévient une personne par SMS ou WhatsApp (ADR-0012). **Canal simulé** tant que le fournisseur n'est pas choisi : le service refuse de démarrer en production.

## Règles

- **Gabarits fermés** (`src/gabarits.ts`) : un identifiant, un texte en français et une date et une heure au fuseau du Gabon.
  - Aucun texte libre : un champ inconnu est **refusé** (400), pas ignoré.
  - Aucune donnée de santé : ni motif, ni spécialité, ni nom du professionnel.
  - 160 caractères au plus, préfixe « Mbolo Santé : ».
  - Toute modification est relue par le porteur de projet avant la production.
- **Appelants** : `POST /notifications` (`destinataire` `Patient/…` ou `Practitioner/…`, `gabarit`, `instant`) exige un jeton de service Keycloak d'audience `mbolo-notifications`, d'un client autorisé (`NOTIFICATIONS_CLIENTS_AUTORISES`, d'abord `mbolo-teleconsultation-service`).
- **Consentement** : un patient n'est prévenu qu'avec un consentement `C-RAPPELS` actif et accepté, lu sans cache (une révocation prend effet aussitôt). Sinon : `ignoree-sans-consentement`. Les professionnels sont prévenus sans condition.
- **Numéro** : lu dans le dossier au moment de l'envoi (`telecom`, mobile de préférence), via la passerelle avec le compte `mbolo-notifications-service` (`system/Patient.r system/Practitioner.r system/Consent.s`). La passerelle ne lui renvoie **que** `telecom` (revendication `mbolo_elements`). Le numéro n'est conservé nulle part.
- **Réponse** : 202 avec `envoyee`, `ignoree-sans-consentement`, `ignoree-sans-numero` ou `echec`. Pour l'appelant, une notification **ne bloque jamais** l'action.
- **Journal** : appelant, gabarit, type de destinataire et résultat. **Jamais le numéro ni le texte.**
- **Canal simulé** : `GET /simulation/boite` (développement et tests), avec la même authentification que l'envoi.

## Configuration

| Variable | Rôle |
|---|---|
| `KEYCLOAK_ISSUER`, `NOTIFICATIONS_AUDIENCE` (défaut `mbolo-notifications`) | Vérification des jetons des services appelants |
| `NOTIFICATIONS_CLIENTS_AUTORISES` | Clients autorisés, séparés par des virgules (défaut `mbolo-teleconsultation-service`) |
| `FHIR_BASE_URL` | Adresse de la passerelle du dossier |
| `NOTIFICATIONS_SERVICE_CLIENT_ID` (défaut `mbolo-notifications-service`), `NOTIFICATIONS_SERVICE_CLE_PRIVEE` (clé privée, `private_key_jwt`, ADR-0016) | Compte de service pour la passerelle, clé depuis le coffre-fort |
| `NOTIFICATIONS_FUSEAU` (défaut `Africa/Libreville`) | Fuseau horaire des dates et heures des messages (IANA) |
| `NOTIFICATIONS_LANGUE` (défaut `fr-FR`) | Langue des textes et formats (BCP 47) ; le service refuse de démarrer si cette langue n'a pas de gabarits approuvés |

## Déploiement dans un autre pays

Le Gabon est le premier pays ; rien de propre au pays n'est codé en dur :

- **Fuseau et formats** : `NOTIFICATIONS_FUSEAU` et `NOTIFICATIONS_LANGUE`, vérifiés au démarrage.
- **Nouvelle langue** : ajouter une entrée au `CATALOGUE` de `src/gabarits.ts`, avec **tous** les gabarits (un test le vérifie, ainsi que la longueur et l'absence de donnée de santé). Les textes sont relus par le porteur de projet, et si possible par un locuteur du pays, avant la production.
- **À venir** : langue choisie par chaque patient (`Patient.communication`), plutôt qu'une langue par déploiement.

## Tests

- **Unitaires** : gabarits (160 caractères, aucune donnée de santé, heure du Gabon), consentement, professionnel prévenu sans condition, sans numéro, échec du canal ; API (401 sans jeton valide, y compris pour la boîte ; texte libre, gabarit inconnu ou destinataire non autorisé refusés ; journal sans numéro ni texte).
- **E2E** (`features-gherkin/teleconsultation/visio.feature`) : le médecin est prévenu quand le patient annule ; le patient n'est prévenu d'un report qu'après avoir accepté les rappels.

## Reste à faire avant la production

- Choix du fournisseur SMS et WhatsApp (porteur de projet), expéditeur, relecture des gabarits, langues locales, pas d'envoi la nuit.
