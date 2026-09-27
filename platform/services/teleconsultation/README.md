# Service `teleconsultation` (prototype)

Téléconsultation vidéo avec **LiveKit** (ADR-0002, ADR-0011), derrière le flag **`teleconsultation.video`** (vague 1, désactivé par défaut). **Prototype** : le service refuse de démarrer en production (test terrain à faire).

## Règles

- Un **patient** demande un rendez-vous vidéo avec un professionnel : `POST /rendez-vous` (`praticienId`, `debut`, `dureeMinutes` de 5 à 120). Le rendez-vous ne contient **aucune donnée de santé** : ni motif, ni symptôme.
- **Rendez-vous dans le dossier médical** : ressource FHIR `Appointment` (profil `mbolo-rendez-vous`), écrite **via la passerelle** avec le compte de service `mbolo-teleconsultation-service`, limité à `system/Appointment.crus`. Le service lui-même ne garde rien.
  - Le profil **interdit tout motif, pièce jointe ou texte libre** (invariant `mbolo-rdv-1`) et impose **un patient et un professionnel** (`mbolo-rdv-2`).
  - Un professionnel inconnu du dossier est refusé (422).
  - Un rendez-vous dont le statut n'est plus `booked` (annulé dans le dossier) ferme la salle.
- **Annulation** : `POST /rendez-vous/:id/annulation`, par le patient ou le professionnel du rendez-vous.
  - Un tiers reçoit un 404, sans apprendre que le rendez-vous existe.
  - Refusée (409) si le rendez-vous est déjà annulé ou terminé, ou s'il a changé entre-temps (verrou optimiste).
  - Le rendez-vous est **conservé** dans le dossier (`cancelled`), avec **qui** a annulé (code `patient` ou `professionnel`) et **quand** (extension `date-annulation`). **Aucun motif** n'est demandé ni conservé (invariant `mbolo-rdv-4`).
  - La salle se ferme aussitôt.
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
- **Journal** : demande de rendez-vous et entrée en salle (compte, rendez-vous). Le jeton n'est jamais journalisé.

## Configuration

| Variable | Rôle |
|---|---|
| `KEYCLOAK_ISSUER`, `TELECONSULTATION_AUDIENCE` (défaut `mbolo-teleconsultation-api`) | Vérification des jetons des applications |
| `WEBRTC_SERVER_URL` | Adresse LiveKit pour les clients (ex. `wss://visio.mbolo-sante.example`) |
| `WEBRTC_API_KEY`, `WEBRTC_API_SECRET` | Clé d'API LiveKit, depuis le coffre-fort (`secrets/templates/webrtc.env.example`) |
| `UNLEASH_API_URL`, `UNLEASH_BACKEND_TOKEN` | Feature flags ; sans eux, la fonction est désactivée |
| `FHIR_BASE_URL` | Adresse de la passerelle du dossier (ex. `https://passerelle.mbolo-sante.example/fhir`) ; sans elle, rendez-vous **en mémoire** (développement seulement) |
| `TELECONSULTATION_SERVICE_CLIENT_ID` (défaut `mbolo-teleconsultation-service`), `TELECONSULTATION_SERVICE_CLIENT_SECRET` | Compte de service pour la passerelle, secret depuis le coffre-fort |

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

- Report d'un rendez-vous ; créneaux proposés par les professionnels ; notification de l'annulation à l'autre participant.
- Applications patient et professionnel, avec le **repli audio automatique** quand la qualité baisse.
- TURN et hébergement HDS, au plus près du Gabon.
- **Test terrain** en 3G/4G, avec des seuils à fixer par le porteur de projet.
