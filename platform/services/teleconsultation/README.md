# Service `teleconsultation` (prototype)

Téléconsultation vidéo avec **LiveKit** (ADR-0002, ADR-0011), derrière le flag **`teleconsultation.video`** (vague 1, désactivé par défaut). **Prototype** : rendez-vous en mémoire, le service refuse de démarrer en production.

## Règles

- Un **patient** demande un rendez-vous vidéo avec un professionnel : `POST /rendez-vous` (`praticienId`, `debut`, `dureeMinutes` de 5 à 120). Le rendez-vous ne contient **aucune donnée de santé** : ni motif, ni symptôme.
- `GET /rendez-vous` : le patient voit ses rendez-vous, le professionnel les siens.
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
  - contenu du jeton LiveKit (salle, durée, aucun droit d'enregistrement).
- **E2E** (`features-gherkin/teleconsultation/visio.feature`) :
  - le patient et le médecin rejoignent la salle depuis **deux navigateurs** (micro simulé) et **s'entendent** ;
  - un autre patient ou un infirmier ne peut pas entrer ;
  - la fonction est refusée hors cohorte ;
  - 401 sans jeton.

## Reste à faire avant la vague 1

- Rendez-vous stockés dans le dossier (FHIR `Appointment`, via la passerelle et un compte de service).
- Applications patient et professionnel, avec le **repli audio automatique** quand la qualité baisse.
- TURN et hébergement HDS, au plus près du Gabon.
- **Test terrain** en 3G/4G, avec des seuils à fixer par le porteur de projet.
