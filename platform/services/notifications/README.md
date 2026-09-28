# Service `notifications` (prototype)

Prévient une personne par SMS ou WhatsApp (ADR-0012). **Canal simulé** tant que le fournisseur n'est pas choisi : le service refuse de démarrer en production.

## Règles

- **Gabarits fermés** (`src/gabarits.ts`) : un identifiant, un texte en français et une date et une heure au fuseau du Gabon.
  - `rendez-vous-annule`, `rendez-vous-reporte` : l'autre participant d'une annulation ou d'un report ;
  - `rendez-vous-confirme` (paiement reçu) et `reservation-expiree` (paiement non reçu à temps) : le patient, pour une réservation payante (ADR-0017). Ni montant, ni opérateur, ni numéro dans le texte.
  - Aucun texte libre : un champ inconnu est **refusé** (400), pas ignoré.
  - Aucune donnée de santé : ni motif, ni spécialité, ni nom du professionnel.
  - 160 caractères au plus, préfixe « Mbolo Santé : ».
  - Toute modification est relue par le porteur de projet avant la production.
- **Invitation d'un proche** (ADR-0019) : `POST /invitations-proche` (`telephone` au format international, `code`, `jours`), réservé aux clients de `NOTIFICATIONS_APPELANTS_INVITATION` (le service `invitations`), qui ne peuvent rien envoyer d'autre. Gabarit fermé : « Mbolo Santé : vous êtes invité à suivre un proche. Votre code : …, valable … jours. Créez votre compte dans l'application. » — ni nom du patient ni donnée de santé. Le numéro, saisi par le patient, n'est ni lu dans le dossier ni gardé ; pas de consentement `C-RAPPELS` (le proche n'est pas un patient, c'est le patient qui demande l'envoi). Le journal ne contient ni le numéro ni le code.
- **Alertes au patient** (ADR-0019) : `POST /alertes/:alerte` (`patientId`), mêmes appelants que l'invitation ; liste fermée d'alertes. `proche-inscrit` : « Mbolo Santé : votre proche invité a créé son compte. Si ce n'est pas vous qui l'avez invité, retirez-le dans l'application. » — numéro lu dans le dossier ; **envoyée même sans `C-RAPPELS`** (alerte de sécurité sur l'accès au dossier, décision du porteur de projet, à valider par le juriste). `proches-retires` (retrait par l'équipe d'assistance) : « Mbolo Santé : à votre demande, l'équipe a retiré l'accès de vos proches à votre dossier. Si vous n'avez rien demandé, contactez l'équipe. »
- **Appelants** : `POST /notifications` (`destinataire` `Patient/…` ou `Practitioner/…`, `gabarit`, `instant`) exige un jeton de service Keycloak d'audience `mbolo-notifications`, d'un client autorisé (`NOTIFICATIONS_CLIENTS_AUTORISES`, d'abord `mbolo-teleconsultation-service`).
- **Consentement** : un patient n'est prévenu qu'avec un consentement `C-RAPPELS` actif et accepté, lu sans cache (une révocation prend effet aussitôt). Sinon : `ignoree-sans-consentement`. Les professionnels sont prévenus sans condition.
- **Numéro** : lu dans le dossier au moment de l'envoi (`telecom`, mobile de préférence), via la passerelle avec le compte `mbolo-notifications-service` (`system/Patient.r system/Practitioner.r system/Consent.s`). La passerelle ne lui renvoie **que** `telecom` (revendication `mbolo_elements`). Le numéro n'est conservé nulle part.
- **Réponse** : 202 avec `envoyee`, `ignoree-sans-consentement`, `ignoree-sans-numero` ou `echec`. Pour l'appelant, une notification **ne bloque jamais** l'action.
- **Journal** : appelant, gabarit, type de destinataire et résultat. **Jamais le numéro ni le texte.**
- **Canal simulé** : `GET /simulation/boite` (développement et tests), avec la même authentification que l'envoi.

## Configuration

| Variable                                                                                                                                               | Rôle                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `KEYCLOAK_ISSUER`, `NOTIFICATIONS_AUDIENCE` (défaut `mbolo-notifications`)                                                                             | Vérification des jetons des services appelants                                                                      |
| `NOTIFICATIONS_CLIENTS_AUTORISES`                                                                                                                      | Clients autorisés, séparés par des virgules (défaut `mbolo-teleconsultation-service,mbolo-invitations-service`)     |
| `NOTIFICATIONS_APPELANTS_INVITATION` (défaut `mbolo-invitations-service`)                                                                              | Seuls clients qui envoient les invitations de proches (et rien d'autre)                                             |
| `FHIR_BASE_URL`                                                                                                                                        | Adresse de la passerelle du dossier                                                                                 |
| `NOTIFICATIONS_SERVICE_CLIENT_ID` (défaut `mbolo-notifications-service`), `NOTIFICATIONS_SERVICE_CLE_PRIVEE` (clé privée, `private_key_jwt`, ADR-0016) | Compte de service pour la passerelle, clé depuis le coffre-fort                                                     |
| `NOTIFICATIONS_FUSEAU` (défaut `Africa/Libreville`)                                                                                                    | Fuseau horaire des dates et heures des messages (IANA)                                                              |
| `NOTIFICATIONS_LANGUE` (défaut `fr-FR`)                                                                                                                | Langue des textes et formats (BCP 47) ; le service refuse de démarrer si cette langue n'a pas de gabarits approuvés |

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

## Sécurité HTTP (revue ASVS n°1)

- Toutes les réponses portent `Cache-Control: no-store` et `X-Content-Type-Options: nosniff` (`entetesSecurite`).
- En production, les adresses des autres services, de Keycloak et du dossier doivent être en `https://` : sinon le service ne démarre pas (`exigerHttps`).
- Derrière le proxy de confiance de l'hébergeur : `NOTIFICATIONS_TRUST_PROXY=true`, pour que la limite d'appels vaille par adresse réelle (désactivé par défaut).
