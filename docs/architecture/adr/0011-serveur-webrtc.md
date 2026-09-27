# ADR-0011 — Serveur de téléconsultation vidéo : LiveKit

- **Date :** 2026-09-27
- **Statut :** **acceptée — LiveKit** (décision du porteur de projet, 2026-09-27), sous les conditions ci-dessous (prototype, test terrain) ; précise l'outil de l'ADR-0002

## Contexte
L'ADR-0002 impose un serveur WebRTC open source de type SFU, avec :
- un TURN obligatoire ;
- un profil faible débit par défaut ;
- un **repli audio automatique**, puis un repli téléphone ou messagerie.

Deux candidats restent : **LiveKit** et **Jitsi**. La vague 1 (Libreville, médecine générale sur smartphone) a besoin :
- d'applications **à nous** (patient et professionnel), adaptées à la faible littératie : vocal, pictogrammes, peu de texte ;
- d'un contrôle d'accès **par rendez-vous et par consentement**, aligné sur `identite` (ADR-0009) ;
- de rien d'enregistrer par défaut (minimisation, principe n°3) ;
- d'un **hébergement HDS** (ADR-0004) au plus près du Gabon.

## Comparaison

| Critère | LiveKit | Jitsi (Meet + Videobridge) |
|---|---|---|
| Licence | Apache 2.0 | Apache 2.0 |
| Nature | Serveur SFU + SDK clients : on construit **notre** interface | Application de visioconférence complète, avec son interface, intégrable (iframe, SDK mobile) |
| Faible débit | Simulcast, SVC (VP9/AV1), *adaptive stream* (qualité selon la taille affichée), *dynacast* (couches inutiles non envoyées), priorité à l'audio | Simulcast, *last-N* (seuls les N derniers intervenants en vidéo), mode « faible bande passante », désactivation de la vidéo |
| Repli audio | Piloté par notre application : couper la vidéo quand la qualité chute (événements de qualité de connexion) | Réglages et mode audio seul existants, surtout pilotés dans l'interface Jitsi |
| Contrôle d'accès | Jeton de salle **émis par notre service**, durée courte, droits fins (publier, s'abonner) : se branche directement sur `identite` et les consentements | Jeton JWT vérifié par le composant XMPP (Prosody) ; les règles fines (qui entre dans quelle salle) restent à construire autour |
| Applications mobiles | SDK JavaScript, Android, iOS, Flutter, React Native | SDK Jitsi Meet (Android, iOS, React Native) qui embarque l'interface Jitsi |
| Exploitation | Un serveur (Go) avec TURN intégré ; Redis pour plusieurs nœuds | Plusieurs composants : Prosody, Jicofo, Videobridge, serveur web, TURN (coturn) |
| Supervision | Webhooks d'événements, métriques Prometheus, statistiques de qualité | Statistiques Videobridge, exportateurs Prometheus communautaires |
| Chiffrement de bout en bout | Disponible (*insertable streams*), à vérifier sur les navigateurs mobiles visés | Disponible dans les navigateurs compatibles, mêmes réserves |
| Hébergement HDS | Auto-hébergeable (OVHcloud) ; offre gérée non HDS à exclure pour les données de santé | Auto-hébergeable (OVHcloud) |
| Délai pour un premier pilote | Plus long : l'interface est à construire, mais c'est de toute façon prévu pour l'adapter au public | Plus court si l'interface Jitsi est acceptée telle quelle, ce qui cadre mal avec la faible littératie et la charte |

## Recommandation (retenue)
**LiveKit**, pour quatre raisons :
- **Contrôle d'accès** : les jetons de salle sont émis par nos services, après vérification du rendez-vous et du consentement. C'est le même modèle que la passerelle du dossier.
- **Faible débit et repli audio** : ils sont pilotés par **notre** application, ce qui permet de les adapter au contexte gabonais.
- **Exploitation** : un seul serveur, TURN intégré, moins de composants à héberger chez l'hébergeur HDS.
- **Interface** : les applications patient et professionnel sont de toute façon à construire pour notre public.

Jitsi reste l'option de repli si l'on veut une visioconférence de secours très vite, avec son interface d'origine.

## Conditions avant l'adoption définitive
1. **Prototype technique** (PR suivante si la recommandation est acceptée) :
   - service `teleconsultation` qui émet un jeton LiveKit seulement pour un rendez-vous existant, entre le patient et le professionnel concernés ;
   - flag `teleconsultation.video` ;
   - tests e2e avec un serveur LiveKit local.
2. **Test terrain** (skill `tests-terrain-reseau-mobile`) en 3G/4G à Libreville et en province, sur smartphones d'entrée de gamme, avec comme critères :
   - réussite de connexion ;
   - qualité audio ;
   - temps de bascule vers l'audio ;
   - consommation de données par consultation.

   **Les seuils sont à fixer par le porteur de projet.**
3. **Hébergement** : serveur média et TURN chez l'hébergeur HDS retenu, au plus près du Gabon. Pour la latence depuis Libreville, voir la réserve de l'ADR-0004.
4. **Aucun enregistrement** des consultations par défaut. Toute exception doit être décidée et encadrée : consentement, durée, stockage chiffré.

## Prototype (PR K)
- Service `teleconsultation` : rendez-vous demandé par le patient ; jeton de salle réservé au patient et au professionnel du rendez-vous, de 15 min avant le début à 30 min après la fin prévue ; salle de 2 participants, jeton de 10 min sans droit d'enregistrer ; flag `teleconsultation.video`.
- Test e2e : deux navigateurs avec micro simulé se connectent à un vrai LiveKit 1.12.0 et s'entendent.
- PR L : rendez-vous enregistrés dans le dossier (FHIR `Appointment`, profil `mbolo-rendez-vous` sans motif ni texte libre), via la passerelle, avec un compte de service limité à `system/Appointment.crus`.
- Reste à faire avant la vague 1 :
  - annulation, report et créneaux ;
  - applications patient et professionnel ;
  - repli audio automatique côté application ;
  - TURN et hébergement HDS ;
  - test terrain.

## Conséquences
- Nouveau service `platform/services/teleconsultation` : rendez-vous (conservés dans le dossier FHIR, jamais dans le service), jetons de salle et événements de qualité.
- Nouveaux secrets dans l'inventaire : clé et secret d'API LiveKit, secret TURN (`WEBRTC_*`, déjà prévus dans `secrets/inventaire-cles.md`).
- Budget de données par consultation et temps de bascule audio suivis en supervision (skill `supervision-slo`).

Sources : LiveKit — https://docs.livekit.io/ (simulcast, adaptive stream, dynacast, jetons d'accès, auto-hébergement) ; Jitsi — https://jitsi.github.io/handbook/ (architecture, last-N, authentification JWT) ; W3C WebRTC Statistics — https://www.w3.org/TR/webrtc-stats/ ; ADR-0002, ADR-0004, ADR-0009.
