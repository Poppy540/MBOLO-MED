# ADR-0016 — Préparation de la production : clé maître, supervision, authentification des services

- **Date :** 2026-09-27
- **Statut :** proposée
- **Décideurs :** porteur de projet, responsable sécurité (à nommer)

## Contexte

Les services de la vague 1 fonctionnent sur des données fictives et refusent de démarrer en production. Trois points restent ouverts avant d'accueillir de vrais patients (modèle de menaces, AIPD n°1) :

1. **La clé maître des documents** (ADR-0015) :
   - aujourd'hui, c'est une clé de 32 octets lue dans le coffre-fort (`DOCUMENTS_CLE_MAITRE`, ADR-0005) ;
   - elle passe donc par la mémoire du service : un attaquant qui lit cette mémoire et vole le stockage peut déchiffrer toutes les photos.
2. **La supervision** :
   - les services écrivent un journal JSON masqué (`@mbolo/journal-securise`), mais personne ne le lit ;
   - l'astreinte est déjà choisie (Grafana OnCall, ADR-0006), mais rien ne déclenche d'alerte ;
   - or plusieurs mesures en dépendent : revue des consultations de photos, bris de glace, attaques par saturation.
3. **L'authentification des services** :
   - chaque service obtient son jeton auprès de Keycloak avec un **secret partagé** (`*_SERVICE_CLIENT_SECRET`) ;
   - ce secret circule à chaque demande de jeton et existe en deux endroits : le coffre-fort et Keycloak.

Contraintes :
- exportable : l'hébergement est paramétrable par pays (ADR-0004), donc aucun service propriétaire qu'on ne pourrait pas remplacer ;
- petite équipe : l'exploitation doit rester simple ;
- aucune donnée de santé dans les journaux ni dans les alertes (principe n°3) ;
- un agent IA n'agit jamais en production.

## Options envisagées

### A. Clé maître des documents
1. **KMS de l'hébergeur (OVHcloud KMS)** :
   - la clé maître ne quitte jamais le module matériel de l'hébergeur ;
   - le service lui demande d'envelopper ou de désenvelopper la clé de chaque photo, par une API authentifiée par certificat client ;
   - chaque appel est journalisé par le KMS ;
   - même hébergeur que les données (ADR-0004).
2. **Transit d'OpenBao** (auto-hébergé) :
   - même principe, open source et portable ;
   - mais c'est un service de plus à exploiter, à sauvegarder et à sécuriser.
3. **Clé du coffre-fort** (situation actuelle) :
   - simple ;
   - mais la clé est en mémoire du service, avec une rotation manuelle.

### B. Supervision et alertes
1. **Pile Grafana** :
   - journaux JSON centralisés dans **Loki**, mesures dans **Prometheus** ;
   - règles d'alerte envoyées vers **Grafana OnCall** (déjà choisi, ADR-0006) ;
   - auto-hébergée chez l'hébergeur de santé, ou Grafana Cloud en région UE pour les seules mesures techniques.
2. **Solution de l'hébergeur** (OVHcloud Logs Data Platform) : moins d'exploitation, mais propre à cet hébergeur.
3. **Sentry et journaux bruts** : utile pour les erreurs applicatives, insuffisant pour les alertes de sécurité.

### C. Authentification des services auprès de Keycloak
1. **Jeton signé par une clé privée** (`private_key_jwt`, RFC 7523) :
   - chaque service garde sa clé privée ;
   - Keycloak ne connaît que la clé publique ;
   - aucun secret ne circule ni n'est partagé ;
   - rotation en publiant une nouvelle clé publique.
2. **TLS mutuel** (certificat client) : robuste, mais une autorité de certification est à gérer et l'exploitation est plus lourde.
3. **Secret partagé** (situation actuelle), avec rotation tous les 90 jours.

## Recommandation (à décider)

- **A.1 — KMS de l'hébergeur**, dès que le contrat de l'hébergeur de santé est signé :
  - le service `documents` a déjà l'interface prévue pour cela (`CleMaitre`), une nouvelle implémentation suffit ;
  - pour réaliser la rotation, une commande **ré-enveloppe** les clés des photos avec la nouvelle clé maître, sans rien déchiffrer du contenu ;
  - en attendant le KMS : clé du coffre-fort, rotation annuelle.
- **B.1 — Pile Grafana, auto-hébergée chez l'hébergeur de santé**. Les journaux ne contiennent pas de données de santé, mais contiennent des identifiants de dossiers : ils restent au même endroit que les données. Premières alertes, chacune envoyée à la bonne astreinte :

| Alerte | Seuil proposé | Astreinte |
|---|---|---|
| Consultations de photos d'identité par un même vérificateur | plus de 60 par heure | Responsable sécurité |
| Bris de glace | chaque occurrence ; relance si non revu en 24 h | Responsable sécurité (revue : rôle `revue-acces`) |
| Refus d'accès au dossier (403) | plus de 20 en 5 minutes pour un même compte | Responsable sécurité |
| Réponses 429 (limites d'appels) | plus de 100 en 5 minutes | Exploitation |
| Erreurs serveur (5xx) ou dossier indisponible | plus de 1 % sur 5 minutes | Exploitation |
| Service injoignable (`/sante`) | 2 minutes | Exploitation |

- **C.1 — `private_key_jwt`** pour tous les comptes de service :
  - un service à la fois, en gardant le secret partagé pendant la bascule ;
  - les clés privées restent dans le coffre-fort ;
  - les clés publiques sont déclarées dans le royaume Keycloak.

## Conséquences

- **Code** : une PR par sujet.
  - A : `CleMaitreKms` et la commande de ré-enveloppement ;
  - B : événements d'alerte nommés dans le journal, fichiers de règles d'alerte versionnés ;
  - C : authentification des clients par jeton signé dans `@mbolo/identite`.
  - Chaque PR est testée sans service externe : faux KMS et faux Keycloak en tests unitaires ; en e2e, Keycloak et le jeton signé sont réels.
- **Inventaire des secrets** : les `*_SERVICE_CLIENT_SECRET` sont remplacés par des clés privées. On ajoute la référence de la clé KMS (`STORAGE_KMS_KEY_REFERENCE`, déjà inventoriée) et le certificat client du KMS.
- **Plan d'incident** : les alertes nourrissent le scénario « fuite de photos d'identité ». La destruction de la clé maître devient une opération du KMS, réservée à deux personnes.
- **Coûts** : KMS et stockage des journaux, à chiffrer avec le devis de l'hébergeur (tableur du business plan).
- **Risques** :
  - si le KMS est indisponible, plus aucune photo ne peut être déposée ni lue ; la téléconsultation n'en dépend pas ;
  - des alertes trop nombreuses finissent ignorées : seuils à ajuster après un mois de vague 1.

## Décisions demandées au porteur de projet

1. A : KMS de l'hébergeur (recommandé), OpenBao, ou clé du coffre-fort ?
2. B : pile Grafana auto-hébergée (recommandé), ou service de l'hébergeur ? Les seuils proposés vous conviennent-ils ?
3. C : `private_key_jwt` (recommandé), TLS mutuel, ou secret partagé ?
4. Qui reçoit les alertes de sécurité (responsable sécurité) et d'exploitation ?

Sources : ADR-0004, ADR-0005, ADR-0006, ADR-0010, ADR-0015 ; [AIPD n°1](../../securite/aipd-verification-identite.md) ; [modèle de menaces](../../securite/modele-menaces.md) ; RFC 7523 (JWT pour l'authentification des clients OAuth 2.0) ; documentation OVHcloud KMS ; documentation Grafana Loki, Prometheus et OnCall ; OWASP Logging Cheat Sheet.
