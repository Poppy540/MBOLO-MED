# Inventaire des clés — Mbolo Santé

> **Aucune valeur ici.** Ce tableau décrit les clés ; les valeurs vivent dans le coffre-fort **Infisical** (ADR-0005, voir `README.md` §3).
> Emplacement noté `mbolo/<env>/<service>/` = projet Infisical `mbolo-sante`, environnement `<env>` ∈ {`dev`, `recette`, `prod`}, dossier `/<service>/`.
> **Clé API Claude : exclue de cet inventaire** (voir `README.md` §2).
> Les vagues sont celles de `docs/deploiement/vagues.md` (proposition à valider).

**Légende des responsables** (rôles à nommer par le porteur de projet) : **RT** responsable technique · **RS** responsable sécurité · **RP** responsable pharmacies et partenariats · **RR** responsable recrutement · **RA** responsable de l'Académie · **PP** porteur de projet.

**Environnements** : D = dev, R = recette, P = production. En D et R, les clés pointent vers des bacs à sable ou des données fictives uniquement.

## Paiement

| Variable | Service | Agent(s) | Usage | Portée minimale | Env. | Emplacement | Rotation | Resp. | Vague |
|---|---|---|---|---|---|---|---|---|---|
| `MOBILE_MONEY_AGGREGATOR_API_KEY` / `_API_SECRET` | Agrégateur mobile money | Plateforme | Initier un paiement, lire son statut | Collecte uniquement ; pas de décaissement | D R P | `mbolo/<env>/paiement-mobile-money/` | 90 j | RT | 1 |
| `MOBILE_MONEY_WEBHOOK_SIGNING_SECRET` | Agrégateur mobile money | Plateforme | Vérifier la signature des notifications | Vérification uniquement | D R P | idem | 180 j | RT | 1 |
| `AIRTEL_MONEY_CLIENT_ID` / `_SECRET` | Airtel Money (si intégration directe) | Plateforme | Paiement | Collecte uniquement | D R P | `mbolo/<env>/paiement-mobile-money/` | 90 j | RT | 1 |
| `MOOV_MONEY_CLIENT_ID` / `_SECRET` | Moov Money (si intégration directe) | Plateforme | Paiement | Collecte uniquement | D R P | idem | 90 j | RT | 1 |
| `CARD_PAYMENT_SECRET_KEY` | Prestataire carte (diaspora) | Plateforme | Paiement, abonnements | Clé restreinte : paiements + abonnements, pas de virements | D R P | `mbolo/<env>/paiement-carte/` | 90 j | RT | 2 |
| `CARD_PAYMENT_PUBLISHABLE_KEY` | Prestataire carte | Plateforme (front) | Formulaire de paiement | Publique par nature, suivie pour cohérence | D R P | idem | à la rotation de la clé secrète | RT | 2 |
| `CARD_PAYMENT_WEBHOOK_SIGNING_SECRET` | Prestataire carte | Plateforme | Vérifier les notifications | Vérification uniquement | D R P | idem | 180 j | RT | 2 |
| `PAYMENT_STATUS_READONLY_TOKEN_AGENT02` | Service paiement interne | **Agent 2** | Lire le statut de paiement d'une ordonnance ou d'un parcours | **Lecture seule**, statut uniquement, pas de montant détaillé ni de moyen de paiement | D R P | `mbolo/<env>/paiement-carte/` | 90 j | RT | 2 |

## Vidéo

| Variable | Service | Agent(s) | Usage | Portée minimale | Env. | Emplacement | Rotation | Resp. | Vague |
|---|---|---|---|---|---|---|---|---|---|
| `WEBRTC_API_KEY` / `_API_SECRET` | Serveur WebRTC | Plateforme | Générer des jetons de salle à durée courte | Création de jetons de salle | D R P | `mbolo/<env>/webrtc/` | 90 j | RT | 1 |
| `WEBRTC_TURN_SHARED_SECRET` | Serveur TURN | Plateforme | Identifiants TURN temporaires | Relais média | D R P | idem | 90 j | RT | 1 |

## Messagerie patients

| Variable | Service | Agent(s) | Usage | Portée minimale | Env. | Emplacement | Rotation | Resp. | Vague |
|---|---|---|---|---|---|---|---|---|---|
| `SMS_API_KEY_AGENT01` | SMS | **Agent 1** | Confirmations, liens de consultation | Envoi seul, gabarits approuvés, pas de lecture des historiques | D R P | `mbolo/<env>/sms/` | 90 j | RT | 1 |
| `SMS_API_KEY_AGENT02` | SMS | **Agent 2** | Rappels d'observance et de rendez-vous | idem | D R P | idem | 90 j | RT | 2 |
| `WHATSAPP_ACCESS_TOKEN_AGENT01` | WhatsApp Business | **Agent 1** | Conversation d'accueil | Numéro Mbolo uniquement, messages | D R P | `mbolo/<env>/whatsapp/` | 60 j (jeton système) | RT | 1 |
| `WHATSAPP_ACCESS_TOKEN_AGENT02` | WhatsApp Business | **Agent 2** | Rappels, suivi | idem | D R P | idem | 60 j | RT | 2 |
| `WHATSAPP_APP_SECRET` / `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | WhatsApp Business | Plateforme | Vérifier les notifications entrantes | Vérification uniquement | D R P | idem | 180 j | RT | 1 |
| `EMAIL_API_KEY_AGENT01` / `_AGENT02` | E-mail transactionnel | **Agents 1, 2** | Confirmations, diaspora | Envoi seul, domaine vérifié | D R P | `mbolo/<env>/email/` | 90 j | RT | 1 / 2 |

## Voix

| Variable | Service | Agent(s) | Usage | Portée minimale | Env. | Emplacement | Rotation | Resp. | Vague |
|---|---|---|---|---|---|---|---|---|---|
| `VOICE_STT_API_KEY_AGENT01` | Reconnaissance vocale | **Agent 1** | Transcrire la parole du patient | Transcription seule ; **fournisseur à valider** (hébergement, pas de réutilisation pour entraînement) | D R P | `mbolo/<env>/voix/` | 90 j | RS | 1 |
| `VOICE_TTS_API_KEY_AGENT01` | Synthèse vocale | **Agent 1** | Lire les messages à voix haute | Synthèse seule | D R P | idem | 90 j | RT | 1 |

## Dossier médical (FHIR)

| Variable | Service | Agent(s) | Usage | Portée minimale | Env. | Emplacement | Rotation | Resp. | Vague |
|---|---|---|---|---|---|---|---|---|---|
| `FHIR_AMONT_URL` / `PASSERELLE_AUDIENCE` | Passerelle du dossier (ADR-0010) | Plateforme | Adresse interne du serveur FHIR et audience des jetons (pas des secrets) | — | D R P | `mbolo/<env>/fhir/` | — | RS | 0 |
| `FHIR_BASE_URL` | Serveur FHIR | Plateforme (dossier-fhir, identite) | Adresse du dossier ; `identite` y stocke les consentements (pas un secret, suivie pour cohérence) | — | D R P | `mbolo/<env>/fhir/` | — | RS | 0 |
| `FHIR_CLIENT_ID_PLATFORM` / `_SECRET_PLATFORM` | Serveur FHIR | Plateforme | Service dossier-fhir | Selon rôle de l'utilisateur authentifié (SMART on FHIR) | D R P | `mbolo/<env>/fhir/` | 90 j | RS | 0 |
| `FHIR_CLIENT_ID_AGENT01` / `_SECRET_AGENT01` | Serveur FHIR | **Agent 1** | Créer et compléter le dossier du patient en cours d'interaction | Écriture : Patient, Observation, Condition, AllergyIntolerance, Encounter, Consent, QuestionnaireResponse ; **lecture limitée au patient de la session** | D R P | idem | 90 j | RS | 0 (fictif) / 1 |
| `FHIR_CLIENT_ID_AGENT02` / `_SECRET_AGENT02` | Serveur FHIR | **Agent 2** | Lire ordonnances et rendez-vous, créer des rappels | Lecture : MedicationRequest, Appointment, ServiceRequest, CarePlan ; écriture : Communication, AdverseEvent (brouillon) | D R P | idem | 90 j | RS | 2 |
| `FHIR_CLIENT_ID_AGENT04` / `_SECRET_AGENT04` | Serveur FHIR | **Agent 4** | Audit qualité | **Lecture seule d'une vue pseudonymisée**, aucune ressource Patient identifiante | R P | idem | 90 j | RS | 1 |

## Identité (Keycloak)

| Variable | Service | Agent(s) | Usage | Portée minimale | Env. | Emplacement | Rotation | Resp. | Vague |
|---|---|---|---|---|---|---|---|---|---|
| `KEYCLOAK_ISSUER` | Keycloak (ADR-0009) | Plateforme | URL de l'émetteur des jetons (pas un secret, suivie pour cohérence) | — | D R P | `mbolo/<env>/identite/` | — | RS | 0 |
| `IDENTITE_AUDIENCE` | Service identite | Plateforme | Audience attendue dans les jetons | — | D R P | idem | — | RS | 0 |
| `IDENTITE_SERVICE_CLE_PRIVEE` (et `IDENTITE_SERVICE_CERTIFICAT`, public) | Keycloak (ADR-0010) | Plateforme (identite) | Signer une assertion courte à usage unique (`private_key_jwt`, ADR-0016) pour obtenir un jeton de service auprès de Keycloak ; seul le certificat public est déclaré à Keycloak, aucun secret partagé | **Consentements uniquement** (`system/Consent.crus`, jamais de suppression) ; certificat injecté dans le royaume à l'import | D R P | `mbolo/<env>/identite/` | annuelle, ou immédiate en cas de doute : nouvelle paire de clés, nouveau certificat déclaré à Keycloak, redémarrage du service | RS | 0 |
| `TELECONSULTATION_SERVICE_CLE_PRIVEE` (et `TELECONSULTATION_SERVICE_CERTIFICAT`, public) | Keycloak (ADR-0010, ADR-0011) | Plateforme (teleconsultation) | Signer une assertion courte à usage unique (`private_key_jwt`, ADR-0016) pour obtenir un jeton de service auprès de Keycloak ; seul le certificat public est déclaré à Keycloak, aucun secret partagé | **Rendez-vous, agendas, créneaux et annuaire** (`system/Appointment.crus system/Schedule.crus system/Slot.crus system/Practitioner.r`, nom et qualification seulement pour `Practitioner`, jamais de suppression) ; certificat injecté dans le royaume à l'import | D R P | `mbolo/<env>/webrtc/` | annuelle, ou immédiate en cas de doute : nouvelle paire de clés, nouveau certificat déclaré à Keycloak, redémarrage du service | RS | 1 |
| `NOTIFICATIONS_SERVICE_CLE_PRIVEE` (et `NOTIFICATIONS_SERVICE_CERTIFICAT`, public) | Keycloak (ADR-0010, ADR-0012) | Plateforme (notifications) | Signer une assertion courte à usage unique (`private_key_jwt`, ADR-0016) pour obtenir un jeton de service auprès de Keycloak ; seul le certificat public est déclaré à Keycloak, aucun secret partagé | **Lecture du numéro et du consentement aux rappels** (`system/Patient.r system/Practitioner.r system/Consent.s`, aucune écriture) ; certificat injecté dans le royaume à l'import | D R P | `mbolo/<env>/sms/` | annuelle, ou immédiate en cas de doute : nouvelle paire de clés, nouveau certificat déclaré à Keycloak, redémarrage du service | RS | 1 |
| `CONSULTATION_SERVICE_CLE_PRIVEE` (et `CONSULTATION_SERVICE_CERTIFICAT`, public) | Keycloak (ADR-0010) | Plateforme (consultation) | Signer une assertion courte à usage unique (`private_key_jwt`, ADR-0016) pour obtenir un jeton de service auprès de Keycloak ; seul le certificat public est déclaré à Keycloak, aucun secret partagé | **Problèmes (lecture), comptes-rendus (création, lecture), rendez-vous (lecture)** : `system/Condition.rs system/Composition.crs system/Appointment.r`, jamais de suppression ; chaque accès est d'abord autorisé par `identite` | D R P | `mbolo/<env>/fhir/` | annuelle, ou immédiate en cas de doute : nouvelle paire de clés, nouveau certificat déclaré à Keycloak, redémarrage du service | RS | 1 |
| `DOCUMENTS_SERVICE_CLE_PRIVEE` (et `DOCUMENTS_SERVICE_CERTIFICAT`, public) | Keycloak (ADR-0010, ADR-0015) | Plateforme (documents) | Signer une assertion courte à usage unique (`private_key_jwt`, ADR-0016) pour obtenir un jeton de service auprès de Keycloak ; seul le certificat public est déclaré à Keycloak, aucun secret partagé | **Identité déclarée, statut et numéro du patient, charte C-IDENTITE, traces** (`system/Patient.ru system/Consent.s system/AuditEvent.c` ; seuls nom, prénom, naissance, statut et numéro sortent de la passerelle ; **modification limitée au statut et au numéro**, le reste du Patient est conservé par la passerelle) ; certificat injecté dans le royaume à l'import | D R P | `mbolo/<env>/stockage/` | annuelle, ou immédiate en cas de doute : nouvelle paire de clés, nouveau certificat déclaré à Keycloak, redémarrage du service | RS | 1 |
| `KC_BOOTSTRAP_ADMIN_PASSWORD` | Keycloak | **Infrastructure uniquement** | Compte d'administration initial | À désactiver après création d'un administrateur nominatif avec MFA | D R P | idem | après chaque usage | RS | 0 |

## Base de données et stockage

| Variable | Service | Agent(s) | Usage | Portée minimale | Env. | Emplacement | Rotation | Resp. | Vague |
|---|---|---|---|---|---|---|---|---|---|
| `DB_USER` / `DB_PASSWORD` | Base applicative | Plateforme | Données applicatives hors dossier médical | Un utilisateur par service ; secrets dynamiques si le coffre le permet | D R P | `mbolo/<env>/base-donnees/` | 30 j ou dynamique | RT | 0 |
| `INVITATIONS_DATABASE_URL` | Base des services, schéma `invitations` (ADR-0013) | Plateforme (invitations) | Connexion du service des invitations | Rôle d'exécution : lecture, insertion, mise à jour de ses tables ; **ni suppression ni modification du schéma** ; TLS vérifié en production | D R P | `mbolo/<env>/base-donnees/` | 30 j ou dynamique | RT | 1 |
| `INVITATIONS_MIGRATION_DATABASE_URL` | Base des services, schéma `invitations` (ADR-0013) | **Infrastructure uniquement** (démarrage ou déploiement) | Appliquer les migrations versionnées | Propriétaire du schéma `invitations` seulement ; jamais utilisée pour les requêtes du service | D R P | idem | 30 j | RT | 1 |
| `INVITATIONS_CLE_EMPREINTE` | Service des invitations (ADR-0013) | Plateforme (invitations) | Clé HMAC des empreintes de codes d'invitation (aucun code en clair en base) | 32 octets au moins ; la changer invalide les codes en cours | D R P | `mbolo/<env>/base-donnees/` | à chaque vague (codes en cours à réémettre) | RS | 1 |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | Stockage objet chiffré | Plateforme | Documents médicaux (photos d'ordonnances, résultats) | Un seul compartiment, pas de listing public | D R P | `mbolo/<env>/stockage/` | 90 j | RT | 0 |
| `DOCUMENTS_DATABASE_URL` | Base des services, schéma `documents` (ADR-0013, ADR-0015) | Plateforme (documents) | Connexion du service documents (métadonnées, clés enveloppées) | Rôle d'exécution : lecture, insertion, mise à jour de ses tables ; **ni suppression ni modification du schéma** ; TLS vérifié en production | D R P | `mbolo/<env>/base-donnees/` | 30 j ou dynamique | RT | 1 |
| `DOCUMENTS_MIGRATION_DATABASE_URL` | Base des services, schéma `documents` | **Infrastructure uniquement** (démarrage ou déploiement) | Appliquer les migrations versionnées | Propriétaire du schéma `documents` seulement ; jamais utilisée pour les requêtes du service | D R P | idem | 30 j | RT | 1 |
| `DOCUMENTS_CLE_MAITRE` | Service documents (ADR-0015) | Plateforme (documents) | Clé maître locale (32 octets, base64) qui enveloppe la clé de chaque document, en attendant le KMS de l'hébergeur | Envelopper et désenvelopper les clés de documents ; jamais les documents eux-mêmes | D R | `mbolo/<env>/stockage/` | annuelle (ré-envelopper les clés) | RS | 1 |
| `STORAGE_KMS_KEY_REFERENCE` | KMS | Plateforme | Référence de la clé de chiffrement (pas la clé elle-même) | Chiffrer / déchiffrer | D R P | idem | rotation annuelle de la clé KMS | RS | 0 |
| `DOCUMENTS_KMS_URL` | KMS de l'hébergeur (ADR-0016) | Plateforme (documents) | Adresse de l'API du KMS (pas un secret) ; si elle est définie, la clé maître actuelle est celle du KMS | — | R P | `mbolo/<env>/stockage/` | — | RS | 1 |
| `DOCUMENTS_KMS_CLE_PRIVEE` (et `DOCUMENTS_KMS_CERTIFICAT`, public ; `DOCUMENTS_KMS_AUTORITE`, facultatif) | KMS de l'hébergeur (ADR-0016) | Plateforme (documents) | Certificat client du service pour le TLS mutuel avec le KMS | Envelopper et désenvelopper les clés de documents avec la seule clé `STORAGE_KMS_KEY_REFERENCE` ; aucune autre opération | R P | `mbolo/<env>/stockage/` | annuelle, ou immédiate en cas de doute | RS | 1 |
| `DOCUMENTS_CLES_MAITRES_ANCIENNES` (et `DOCUMENTS_CLE_MAITRE_ID`) | Service documents (ADR-0016) | **Infrastructure uniquement** (rotation) | Anciennes clés maîtres locales (« id:base64 »), le temps de ré-envelopper les clés des documents | Relire seulement ; retirées dès la rotation terminée | D R | `mbolo/<env>/stockage/` | supprimées après chaque rotation | RS | 1 |

## Pharmacies et laboratoires

| Variable | Service | Agent(s) | Usage | Portée minimale | Env. | Emplacement | Rotation | Resp. | Vague |
|---|---|---|---|---|---|---|---|---|---|
| `PHARMACY_PARTNER_API_KEY_AGENT02` | Intégration pharmacies partenaires | **Agent 2** | Vérifier les stocks, déposer une ordonnance **signée** | Stocks en lecture ; dépôt d'ordonnance signée ; aucune modification d'ordonnance | D R P | `mbolo/<env>/pharmacies-labos/` | 90 j (une clé par partenaire) | RP | 2 |
| `LAB_PARTNER_API_KEY_AGENT02` | Intégration laboratoires | **Agent 2** | Transmettre une demande signée, suivre un résultat | Dépôt de demande signée, lecture du statut | D R P | idem | 90 j | RP | 3 |

## Recrutement

| Variable | Service | Agent(s) | Usage | Portée minimale | Env. | Emplacement | Rotation | Resp. | Vague |
|---|---|---|---|---|---|---|---|---|---|
| `CRM_API_TOKEN_AGENT03` | CRM | **Agent 3** | Suivi du pipeline | Écriture limitée aux fiches prospects ; **pas d'envoi de messages**, pas d'export massif | D R P | `mbolo/<env>/recrutement/` | 90 j | RR | 1 |
| `PRO_REGISTRY_API_KEY_AGENT03` | Annuaires professionnels publics (API) | **Agent 3** | Pré-vérification d'inscription | Lecture seule, conditions d'utilisation vérifiées | D R P | idem | 180 j | RR | 1 |

## Formation

| Variable | Service | Agent(s) | Usage | Portée minimale | Env. | Emplacement | Rotation | Resp. | Vague |
|---|---|---|---|---|---|---|---|---|---|
| `LMS_API_TOKEN_AGENT05` | Plateforme de formation | **Agent 5** | Parcours, quiz, attestations | Contenus en brouillon ; publication réservée à un médecin relecteur | D R P | `mbolo/<env>/formation/` | 90 j | RA | 3 |
| `MENTORING_VIDEO_API_KEY` / `_SECRET` | Visioconférence de mentorat | Plateforme (Académie) | Salles de mentorat | Création de salles | D R P | idem | 90 j | RA | 3 |

## Salle de contrôle (Agent 6)

| Variable | Service | Agent(s) | Usage | Portée minimale | Env. | Emplacement | Rotation | Resp. | Vague |
|---|---|---|---|---|---|---|---|---|---|
| `GIT_READONLY_TOKEN_PILOTE` | Dépôt Git | **Agent 6** | Lire code et historique | Lecture seule | P | `mbolo/prod/salle-de-controle/` | 90 j | RS | 0 |
| `GIT_PR_TOKEN_PILOTE` | Dépôt Git | **Agent 6** (niveau 3) | Créer une branche, ouvrir une demande de revue | Branches `pilote/*` uniquement ; **aucun droit de fusion**, `main` protégée | P | idem | 90 j | RS | 0 |
| `TASKS_API_TOKEN_PILOTE` | Gestionnaire de tâches | **Agent 6** | Lire et créer des tickets | Lecture + création de tickets (niveau 4 si validé) | P | idem | 90 j | PP | 0 |
| `SENTRY_AUTH_TOKEN_READONLY` | Sentry | **Agent 6** | Lire les erreurs | Lecture seule ; données personnelles filtrées côté Sentry | P | idem | 90 j | RT | 1 |
| `GRAFANA_API_TOKEN_VIEWER` | Grafana | **Agent 6** | Lire métriques et SLO | Rôle Viewer | P | idem | 90 j | RT | 1 |
| `SECURITY_SCANNER_TOKEN_READONLY` | Scanners de sécurité | **Agent 6** | Lire les résultats ; relancer un scan si niveau 4 validé | Lecture (+ relance de scan) | P | idem | 90 j | RS | 0 |
| `SLACK_BOT_TOKEN_PILOTE` | Slack (ADR-0006) | **Agent 6** | Alertes, briefs, fiches | Écriture seule dans les canaux de la salle de contrôle ; pas de lecture des messages privés | P | idem | 90 j | PP | 0 |
| `ONCALL_INTEGRATION_URL_PILOTE` | Grafana OnCall (ADR-0006) | **Agent 6** | Déclencher l'astreinte (appel / SMS) pour les alertes critiques | Création d'alerte uniquement | P | idem | 90 j | RS | 0 |

## Feature flags

| Variable | Service | Agent(s) | Usage | Portée minimale | Env. | Emplacement | Rotation | Resp. | Vague |
|---|---|---|---|---|---|---|---|---|---|
| `UNLEASH_BACKEND_TOKEN` | Unleash (ADR-0007) | Plateforme | Évaluer les flags | Jeton backend, évaluation seule | D R P | `mbolo/<env>/feature-flags/` | 90 j | RT | 0 |
| `UNLEASH_ADMIN_TOKEN` / `UNLEASH_DB_PASSWORD` | Unleash (ADR-0007) | Tests e2e (local, CI) | Configurer les flags de test, base d'Unleash | **Jamais en recette ni en production** : générés à chaque exécution de la CI | D | poste local / CI éphémère | à chaque exécution | RT | 0 |
| `UNLEASH_READONLY_TOKEN_PILOTE` | Unleash | **Agent 6** | Lire l'état des flags | **Lecture seule** — jamais d'activation | P | idem | 90 j | RT | 0 |

## Coffre-fort

| Variable | Service | Agent(s) | Usage | Portée minimale | Env. | Emplacement | Rotation | Resp. | Vague |
|---|---|---|---|---|---|---|---|---|---|
| `INFISICAL_MACHINE_IDENTITY_CLIENT_ID` / `_CLIENT_SECRET` | Infisical (ADR-0005) | **Infrastructure uniquement** | Identité machine pour lire les secrets d'un service | Une politique par service, lecture des seuls chemins du service | D R P | Fourni par l'orchestrateur d'infrastructure, jamais stocké | 30 j ou identité de charge de travail (OIDC) | RS | 0 |

## Hors inventaire

- **`ANTHROPIC_API_KEY`** : exclue à la demande du porteur de projet. Voir `README.md` §2.

## Journal des modifications de l'inventaire

| Date | Modification | Validée par |
|---|---|---|
| 2026-09-26 | Création initiale (vague 0) | En attente — responsable sécurité à nommer |
| 2026-09-26 | Outils choisis (D-0002) : Infisical, Slack + Grafana OnCall, Unleash ; variables renommées en conséquence | En attente — responsable sécurité à nommer |
| 2026-09-27 | Ajout de la section Identité (Keycloak, ADR-0009) | En attente — responsable sécurité à nommer |
| 2026-09-27 | `FHIR_BASE_URL` inventoriée (utilisée aussi par `identite`) | En attente — responsable sécurité à nommer |
| 2026-09-27 | Compte de service `IDENTITE_SERVICE_CLIENT_SECRET` et variables de la passerelle (ADR-0010) | En attente — responsable sécurité à nommer |
| 2026-09-27 | Jeton d'administration et base d'Unleash pour les tests (ADR-0007) | En attente — responsable sécurité à nommer |
| 2026-09-27 | Compte de service `TELECONSULTATION_SERVICE_CLIENT_SECRET` (rendez-vous dans le dossier, PR L) | En attente — responsable sécurité à nommer |
| 2026-09-27 | Compte de service `NOTIFICATIONS_SERVICE_CLIENT_SECRET` (ADR-0012, PR P) | En attente — responsable sécurité à nommer |
| 2026-09-27 | Compte de service `CONSULTATION_SERVICE_CLIENT_SECRET` (consultation clinique, PR V) | En attente — responsable sécurité à nommer |
| 2026-09-27 | Base des services et invitations : `INVITATIONS_DATABASE_URL`, `INVITATIONS_MIGRATION_DATABASE_URL`, `INVITATIONS_CLE_EMPREINTE` (ADR-0013, PR Z) | En attente — responsable sécurité à nommer |
| 2026-09-27 | Documents chiffrés : `DOCUMENTS_CLE_MAITRE` (clé maître locale), `STORAGE_*` utilisées par le service documents (ADR-0015, PR AF) | En attente — responsable sécurité à nommer |
| 2026-09-27 | Dépôt des photos d'identité : compte de service `DOCUMENTS_SERVICE_CLIENT_SECRET`, `DOCUMENTS_DATABASE_URL`, `DOCUMENTS_MIGRATION_DATABASE_URL` (ADR-0015, PR AG) | En attente — responsable sécurité à nommer |
| 2026-09-27 | Vérificateur d'identité : portée de `DOCUMENTS_SERVICE_CLIENT_SECRET` étendue (statut et numéro, traces), aucune nouvelle clé (ADR-0015, PR AH) | En attente — responsable sécurité à nommer |
| 2026-09-28 | Clé maître des documents : KMS de l'hébergeur (`DOCUMENTS_KMS_*`, `STORAGE_KMS_KEY_REFERENCE`), trousseau et rotation (ADR-0016, PR AO) | En attente — responsable sécurité à nommer |
| 2026-09-27 | Comptes de service : secrets partagés `*_SERVICE_CLIENT_SECRET` remplacés par des clés privées `*_SERVICE_CLE_PRIVEE` (`private_key_jwt`), certificats publics `*_SERVICE_CERTIFICAT` déclarés à Keycloak (ADR-0016, PR AM) | En attente — responsable sécurité à nommer |
