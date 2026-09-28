# Service `teleconsultation` (prototype)

Téléconsultation vidéo avec **LiveKit** (ADR-0002, ADR-0011), derrière le flag **`teleconsultation.video`** (vague 1, désactivé par défaut). **Prototype** : le service refuse de démarrer en production (test terrain à faire).

## Règles

- **Créneaux** : le **professionnel** publie ses créneaux, `POST /creneaux` (`debut`, `dureeMinutes` de 5 à 120, `nombre` de 1 à 16 créneaux consécutifs).
  - Les créneaux doivent être à venir et ne pas chevaucher ceux déjà publiés (sinon 409).
  - Ils sont enregistrés dans le dossier : agenda FHIR `Schedule` (profil `mbolo-agenda`, un seul professionnel) et `Slot` (profil `mbolo-creneau`, **aucun texte libre**).
- `GET /praticiens` : **annuaire** pour les patients de la cohorte. Il liste les professionnels qui ont un agenda, avec leur nom, leur spécialité et leur prochain créneau libre sur 14 jours, les plus proches d'abord. La passerelle ne renvoie à ce service que `Practitioner.name` et `Practitioner.qualification` (revendication `mbolo_elements`) : ni téléphone, ni adresse, ni numéro professionnel.
- `GET /creneaux` : le **professionnel** voit ses créneaux à venir (libres et réservés, 14 jours). Sans condition de flag, pour pouvoir retirer ses créneaux après un retour arrière.
- `GET /praticiens/:id/creneaux` : le **patient** voit les créneaux **libres** du professionnel dans les 14 prochains jours.
- **Réservation** : le **patient** réserve un créneau libre et à venir, `POST /rendez-vous` (`creneauId`).
  - Le créneau passe à « réservé » avec un **verrou optimiste** : deux patients ne peuvent pas réserver le même créneau (409).
  - Si le dossier refuse ensuite le rendez-vous, le créneau redevient libre.
  - Le rendez-vous ne contient **aucune donnée de santé** : ni motif, ni symptôme.
- **Rendez-vous dans le dossier médical** : ressource FHIR `Appointment` (profil `mbolo-rendez-vous`), écrite **via la passerelle** avec le compte de service `mbolo-teleconsultation-service`, limité à `system/Appointment.crus system/Schedule.crus system/Slot.crus`. Le service lui-même ne garde rien.
  - Le profil **interdit tout motif, pièce jointe ou texte libre** (invariant `mbolo-rdv-1`) et impose **un patient et un professionnel** (`mbolo-rdv-2`).
  - Le rendez-vous garde la référence de son créneau (`Appointment.slot`).
  - Un rendez-vous dont le statut n'est plus `booked` (annulé dans le dossier) ferme la salle.
- **Report** : `POST /rendez-vous/:id/report` (`creneauId`), par le patient ou le professionnel du rendez-vous, avant son début.
  - Le nouveau créneau doit être libre, à venir et **chez le même professionnel** (sinon 409). Un tiers reçoit un 404.
  - Ordre : le nouveau créneau est bloqué (verrou), puis le rendez-vous est mis à jour (verrou), puis l'ancien créneau est libéré. Si la mise à jour échoue, le nouveau créneau est rendu.
  - Même rendez-vous (même identifiant, mêmes participants) : l'historique des versions reste dans le dossier.
- **Retrait d'un créneau** : `POST /creneaux/:id/retrait`, par le professionnel titulaire. Seul un créneau **libre** se retire (sinon 409 : annuler d'abord le rendez-vous) ; il passe à `busy-unavailable`, reste dans l'agenda mais n'est plus proposé, et la plage peut être republiée. Le créneau d'un autre professionnel : 404. Comme l'annulation, le retrait ne dépend pas du flag.
- **Annulation** : `POST /rendez-vous/:id/annulation`, par le patient ou le professionnel du rendez-vous.
  - Un tiers reçoit un 404, sans apprendre que le rendez-vous existe.
  - Refusée (409) si le rendez-vous est déjà annulé ou terminé, ou s'il a changé entre-temps (verrou optimiste).
  - Le rendez-vous est **conservé** dans le dossier (`cancelled`), avec **qui** a annulé (code `patient` ou `professionnel`) et **quand** (extension `date-annulation`). **Aucun motif** n'est demandé ni conservé (invariant `mbolo-rdv-4`).
  - La salle se ferme aussitôt et le créneau à venir **redevient libre**.
  - Pas de condition de flag : si la fonction est désactivée, chacun peut encore annuler ses rendez-vous.
- `GET /rendez-vous` : le patient voit ses rendez-vous, le professionnel les siens (recherche sans cache, chaque résultat revérifié).
- `POST /rendez-vous/:id/salle` renvoie l'adresse LiveKit et un **jeton de salle** aux conditions suivantes :
  - l'utilisateur est le **patient** ou le **professionnel** de ce rendez-vous. Sinon **404**, sans révéler que le rendez-vous existe ;
  - l'heure est comprise entre **15 min avant le début et 30 min après la fin prévue**. Sinon 409 ;
  - le flag `teleconsultation.video` est actif pour ce compte. Sinon 403 « Fonction non disponible. ».
- **Salle** `rdv-<id>` : **2 participants au maximum**, fermée 5 min après le départ du dernier participant.
- **Jeton de 10 min** :
  - identité technique (jamais le nom) et libellé neutre (« Patient » ou « Professionnel de santé ») ;
  - droit de publier et de recevoir le son et la vidéo ;
  - **pas de données, pas d'enregistrement, pas d'administration**.
- **Notifications** (ADR-0012) : après une annulation ou un report, l'**autre participant** est prévenu par le service `notifications` (`NOTIFICATIONS_URL`), avec le même jeton de service. Un échec est journalisé et ne bloque jamais l'action.
- **Journal** : demande de rendez-vous et entrée en salle (compte, rendez-vous). Le jeton n'est jamais journalisé.

## Réservation payante (ADR-0017)

Quand le flag **`paiement.mobile-money`** est actif pour le patient :
- `POST /rendez-vous` **retient le créneau** et crée le rendez-vous « à payer » (FHIR `Appointment.status = pending`, date de réservation dans `Appointment.created`).
  - Le service `paiement` crée le paiement (médecine générale en vague 1, montant de la grille du pays) ; la réponse contient `paiement` (`id`, `montant`, `devise`) et `expireLe`.
  - Si le paiement ne peut pas être préparé, la réservation est annulée par la plateforme et le créneau rendu (503).
  - Flag actif sans service de paiement configuré : refus (503), jamais une consultation gratuite par erreur.
- `POST /rendez-vous/:id/paiement` (patient du rendez-vous) : le service demande « payé ou non » au service `paiement`.
  - Payé : le rendez-vous est confirmé (`booked`, verrou optimiste).
  - Délai dépassé sans paiement : annulé par la **plateforme** (code `plateforme`, sans motif) et le créneau redevient libre.
  - Sinon il reste « à payer », avec `expireLe`.
- **Passage périodique** (toutes les minutes par défaut) : même traitement pour toutes les réservations en attente. Si le service de paiement ne répond pas, **rien n'est annulé** : la réservation est reprise au passage suivant.
- Tant que le rendez-vous est « à payer » : pas de salle (409), pas de report (409). Le patient peut l'annuler ; le créneau se libère.
- Flag fermé : la réservation est confirmée aussitôt, sans paiement (cohorte pilote gratuite).
- **Limite connue** : un paiement validé après l'annulation (délai dépassé ou abandon) sera repris par le rapprochement et remboursé après validation humaine (PR à venir).

## Identité vérifiée avant toute réservation (ADR-0014)

- **Réservation** : `POST /rendez-vous` est refusée (403) tant que l'identité du patient n'est pas `verifiee`. Le statut est lu dans le dossier, sans cache.
- **Minimisation** : le compte de service ne reçoit, du `Patient`, que l'extension de statut (`system/Patient.r` limité à `Patient.extension`). Jamais le nom, la date de naissance, le téléphone ni le numéro.
- **Consultation par l'application** : `GET /identite` renvoie `{ statut }` (`a-verifier`, `verifiee`, `refusee` ou `inconnu`), pour le patient connecté seulement.
- **Sans dossier FHIR** (mode mémoire), aucune identité n'est connue : aucune réservation.

## Limites d'appels

Toutes les routes sont limitées par adresse (`@fastify/rate-limit`, module officiel de Fastify), pour protéger le service et le dossier médical contre la saturation.
- **Limite générale** : `TELECONSULTATION_LIMITE_PAR_MINUTE`, par défaut 300 appels par minute.
- **Route `/identite`**, plus stricte car elle interroge le dossier à chaque appel : `TELECONSULTATION_LIMITE_IDENTITE_PAR_MINUTE`, par défaut 30.
- **Au-delà** : réponse 429, « Trop de requêtes. Réessayez dans une minute. »
- **Derrière un proxy de confiance** : `TELECONSULTATION_TRUST_PROXY=true`, pour limiter selon l'adresse réelle du client.
- **À faire** : étendre ces limites aux autres services.

## Configuration

| Variable | Rôle |
|---|---|
| `KEYCLOAK_ISSUER`, `TELECONSULTATION_AUDIENCE` (défaut `mbolo-teleconsultation-api`) | Vérification des jetons des applications |
| `WEBRTC_SERVER_URL` | Adresse LiveKit pour les clients (ex. `wss://visio.mbolo-sante.example`) |
| `WEBRTC_API_KEY`, `WEBRTC_API_SECRET` | Clé d'API LiveKit, depuis le coffre-fort (`secrets/templates/webrtc.env.example`) |
| `UNLEASH_API_URL`, `UNLEASH_BACKEND_TOKEN` | Feature flags ; sans eux, la fonction est désactivée |
| `NOTIFICATIONS_URL` | Service de notifications (ex. `http://127.0.0.1:3004`) ; sans elle, personne n'est prévenu |
| `PAIEMENT_URL` | Service de paiement (ex. `http://127.0.0.1:3008`), même jeton de service (audience `mbolo-paiement-api`) ; sans elle, une réservation payante est refusée |
| `TELECONSULTATION_DELAI_PAIEMENT_MINUTES` (défaut `15`), `TELECONSULTATION_EXPIRATION_INTERVALLE_MS` (défaut `60000`) | Durée pendant laquelle le créneau est retenu en attendant le paiement ; fréquence du passage d'expiration |
| `FHIR_BASE_URL` | Adresse de la passerelle du dossier (ex. `https://passerelle.mbolo-sante.example/fhir`) ; sans elle, rendez-vous **en mémoire** (développement seulement) |
| `TELECONSULTATION_SERVICE_CLIENT_ID` (défaut `mbolo-teleconsultation-service`), `TELECONSULTATION_SERVICE_CLE_PRIVEE` (clé privée, `private_key_jwt`, ADR-0016) | Compte de service pour la passerelle, clé depuis le coffre-fort |

## Serveur LiveKit local

`livekit/config-local.yaml` : écoute sur 127.0.0.1 uniquement, pas d'enregistrement. Clés fournies par l'environnement :

```bash
LIVEKIT_KEYS="<clé>: <secret>" livekit-server --config platform/services/teleconsultation/livekit/config-local.yaml
```

En CI, le binaire LiveKit **1.12.0** est téléchargé depuis les versions GitHub, avec son **empreinte SHA-256 vérifiée**. Les clés sont générées et masquées à chaque exécution.

## Tests

- **Unitaires** :
  - participants autorisés et refus (404) ;
  - fenêtre horaire ;
  - flag ;
  - contenu du jeton LiveKit (salle, durée, aucun droit d'enregistrement) ;
  - dépôt FHIR : `Appointment` conforme et sans motif, annulation qui ferme la salle, résultat étranger écarté, refus 422 ;
  - annulation : par le patient ou le médecin, refusée à un tiers (404), en double ou après la fin (409), verrou optimiste, possible même flag retiré.
- **E2E** (`features-gherkin/teleconsultation/visio.feature`) :
  - le patient et le médecin rejoignent la salle depuis **deux navigateurs** (micro simulé) et **s'entendent** ;
  - un autre patient ou un infirmier ne peut pas entrer ;
  - la fonction est refusée hors cohorte ;
  - 401 sans jeton ;
  - le rendez-vous est dans le dossier (sans motif, marqué fictif) et chacun des deux participants le retrouve ;
  - un professionnel inconnu du dossier est refusé ;
  - le patient annule : la salle se ferme et le dossier garde qui et quand ; le médecin annule ; un autre patient ne peut pas.

## Reste à faire avant la vague 1

- Fournisseur SMS / WhatsApp réel pour les notifications (ADR-0012).
- Applications patient et professionnel, avec le **repli audio automatique** quand la qualité baisse.
- TURN et hébergement HDS, au plus près du Gabon.
- **Test terrain** en 3G/4G, avec des seuils à fixer par le porteur de projet.
