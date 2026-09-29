# ADR-0022 — Double authentification des patients pour les actions sensibles

- **Date :** 2026-09-29
- **Statut :** acceptée sur le principe (porteur de projet, 2026-09-29 : code par **SMS**, pour les **actions sensibles** seulement) ; modalités ci-dessous proposées, à confirmer
- **Décideurs :** porteur de projet ; responsable sécurité (à désigner)

## Contexte

La revue OWASP ASVS n°1 (`docs/securite/asvs-matrice.md`) a laissé la décision **D1** ouverte. Aujourd'hui, un patient se connecte avec **son mot de passe seul**. Les professionnels et les proches ont déjà une double authentification (application d'authentification, TOTP).

Or certaines actions d'un patient ont des effets forts : payer, donner accès à son dossier, inviter un proche. Un mot de passe deviné, volé ou réutilisé suffit aujourd'hui à les faire.

Contraintes :

- **Faible littératie, téléphones d'entrée de gamme, réseau instable** : une application d'authentification est difficile pour beaucoup de patients, et un code à chaque connexion coûte des SMS et en fait échouer.
- **Vol de carte SIM** : un SMS n'est pas un facteur parfait. Il reste bien meilleur que le mot de passe seul, et le vol de SIM est un risque déjà accepté pour la récupération du compte (ADR-0021).
- **Numéro** : le numéro du **dossier** (`Patient.telecom`), jamais un numéro saisi au moment de l'action.
- **La sécurité n'est jamais derrière un flag** (`docs/deploiement/flags.md`).
- **Fournisseur SMS** : pas encore choisi (ADR-0012). Le canal simulé sert en développement et en e2e ; il est refusé en production.

## Options envisagées

1. **Code à chaque connexion** : plus sûr, mais coûteux et source d'échecs. Écarté par le porteur de projet.
2. **Code pour les actions sensibles seulement** (retenu) : la connexion reste simple ; un code est demandé juste avant l'action.
3. **Application d'authentification (TOTP)** : gratuite et plus sûre, mais trop difficile pour beaucoup de patients. Écartée pour les patients ; elle reste en place pour les professionnels et les proches.

## Décision (principe) et modalités proposées

### Mécanisme : authentification renforcée par Keycloak (« step-up »)

- **Niveaux d'authentification** (Keycloak, *Level of Authentication*) :
  - **1** : mot de passe ;
  - **2** : mot de passe, puis code reçu par SMS.
- **Côté application** : avant une action sensible, l'application patient redemande une connexion au niveau 2 (`acr_values`). Si le patient a déjà atteint ce niveau récemment, Keycloak ne redemande rien. Sinon, il envoie un code au numéro du dossier.
- **Côté extension Keycloak** (nouvel authentificateur) :
  - code de 6 chiffres, valable **5 minutes** ;
  - **3 essais** ;
  - **renvoi limité** (1 par minute, 5 par heure) ;
  - seule une empreinte du code est gardée, dans la session d'authentification.
  - L'envoi passe par le service `notifications`, avec un gabarit fermé `code-connexion`, sans condition `C-RAPPELS` et sans donnée de santé.
- **Côté services** : les routes sensibles exigent un jeton de **niveau 2** (revendication `acr`). Le niveau 2 reste valable **15 minutes** (âge maximal du niveau dans Keycloak). Au-delà, un nouveau code est demandé.
- **Mot de passe et code** : ils ne sortent jamais de Keycloak. Le service `notifications` reçoit le texte fermé et le dossier, jamais le mot de passe.

### Actions sensibles (proposé)

| Action | Service | Pourquoi |
| --- | --- | --- |
| Payer une consultation (lancer la collecte mobile money) | `paiement` | Argent |
| Partager son dossier avec un médecin (`C-PARTAGE-PRO`) | `identite` | Accès au dossier |
| Inviter un proche (`C-PROCHE`) | `invitations` | Accès durable au dossier |

**Jamais derrière un code** : retirer un partage, retirer un proche, annuler un rendez-vous, lire ses documents et son historique. Couper un accès doit rester immédiat.

### Cas dégradés

- **Pas de numéro dans le dossier, ou SMS qui n'arrive pas** : l'action est refusée, avec un message simple (« Le code n'a pas pu être envoyé. Réessayez, ou appelez l'équipe. »). Aucun contournement.
- **Téléphone perdu** : le patient passe par l'équipe d'assistance, qui peut retirer ses proches (ADR-0019) et lui remettre un code de récupération (ADR-0021).
- **Urgence médicale** : jamais concernée. Aucune action sensible ne bloque l'orientation vers les secours (principe n°2).

## Conséquences

- **Positives** :
  - un mot de passe volé ne suffit plus pour payer ni pour donner accès au dossier ;
  - la connexion quotidienne reste simple ;
  - un seul mécanisme (Keycloak) et une seule vérification par les services (`acr`).
- **Négatives** :
  - un SMS par action sensible, au plus un toutes les 15 minutes : c'est un coût à suivre (skill `suivi-couts-infrastructure`) ;
  - l'extension Keycloak s'agrandit.
- **Risques** :
  - vol de carte SIM (voir le contexte) ;
  - SMS perdus sur un réseau instable : à mesurer au test terrain (skill `tests-terrain-reseau-mobile`).

## Mise en œuvre (petites PR)

1. **Keycloak** : authentificateur `mbolo-code-sms` et flux de connexion à deux niveaux ; gabarit `code-connexion` du service `notifications`. E2E : code reçu dans la boîte SMS simulée, niveau 2 dans le jeton.
2. **Services** : `acr` exigé sur les trois routes sensibles (refus 401 avec le motif `niveau-insuffisant`).
3. **Application patient** : demande du niveau 2 avant ces trois actions, puis reprise de l'action.

## Questions au porteur de projet (modalités)

1. **Liste des actions sensibles** : les trois du tableau vous conviennent-elles ?
2. **Durée du niveau 2** : 15 minutes avant de redemander un code ?
3. **Code** : 6 chiffres, valable 5 minutes, 3 essais ?
4. **Texte du SMS** : « Mbolo Santé : votre code est 123456. Il expire dans 5 minutes. Ne le donnez à personne, même à l'équipe. »
