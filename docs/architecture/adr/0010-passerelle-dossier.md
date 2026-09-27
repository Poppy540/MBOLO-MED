# ADR-0010 — Passerelle du dossier médical et comptes de service

- **Date :** 2026-09-27
- **Statut :** proposée (à valider par le porteur de projet à la fusion de la PR G)

## Contexte
Le serveur FHIR (HAPI, ADR-0001) ne sait pas vérifier seul les jetons OAuth ni les permissions SMART on FHIR. Jusqu'ici, le service `identite` lui écrivait sans authentification (PR F). Il faut que **chaque accès au dossier** soit :
- authentifié (qui appelle ?) ;
- limité au strict nécessaire (quels types de ressources, quelles interactions ?) ;
- journalisé, sans contenu médical ;
- contrôlé à l'écriture par les règles Mbolo (principe n°1, marqueur fictif, consentement…).

Les agents IA (ADR à venir) devront passer par le même chemin, avec leurs propres permissions (inventaire des secrets : `FHIR_CLIENT_ID_AGENT01`…).

## Options envisagées
1. **Passerelle TypeScript devant HAPI** (`platform/services/passerelle-fhir`) : vérifie le jeton Keycloak, applique les permissions SMART, valide les écritures, journalise ; HAPI n'est jamais exposé.
2. Intercepteur Java dans HAPI : même résultat, mais code Java à maintenir dans une image HAPI personnalisée, hors du socle TypeScript (ADR-0008).
3. Passerelle générique (Kong, Envoy…) : contrôle du jeton possible, mais pas des permissions par type FHIR ni des règles Mbolo sans développement spécifique.

## Décision
Option 1.
- **Comptes de service Keycloak** (flux « client credentials ») : un client confidentiel par service ou agent. Premier compte : `mbolo-identite-service`.
  - Son secret est injecté dans le royaume à l'import (`${IDENTITE_SERVICE_CLIENT_SECRET}`) depuis le coffre-fort : jamais dans le dépôt.
  - Son jeton a pour audience `mbolo-dossier-fhir`.
- **Permissions SMART v2** au format `system/<Type>.<cruds>`. Premier jeu : `system/Consent.crus` pour `identite` (consentements seulement, sans suppression).
  - Elles sont portées par la revendication `mbolo_scopes` : déclarer des portées OAuth personnalisées dans le royaume supprimerait les portées par défaut de Keycloak à l'import.
- **La passerelle refuse par défaut** :
  - jeton absent, d'une autre audience ou altéré → 401 ;
  - type ou interaction hors permission → 403 ;
  - `_include`, `_revinclude`, `_has` et paramètres chaînés → 403 ;
  - suppression, `_history`, opérations `$…` et transactions → route inconnue ;
  - réponse contenant un type hors permission → 403.
- **Écritures validées** par `@mbolo/dossier-fhir` (`valider`) avant transmission : 422 avec les règles violées.
- **Journal** : client, interaction, type, statut. Jamais de contenu médical ni de jeton.
- **HAPI est interne** : seules la passerelle et l'exploitation y accèdent. Les liens de pagination sont réécrits vers l'adresse de la passerelle.

## Conséquences
- Ajout (PR Q) : **minimisation par élément**. La revendication `mbolo_elements` (ex. `Patient.telecom`) restreint ce que la passerelle renvoie pour un type : `_elements` imposé au serveur, puis filtrage de la réponse par la passerelle elle-même.
- `identite` obtient et renouvelle son jeton de service automatiquement (30 s avant expiration). Sans jeton, il répond 503 et ne décide jamais d'un accès sans lire les consentements.
- Chaque nouveau client (agents 1, 2, 4…) = un client Keycloak + une revendication `mbolo_scopes` minimale, revue par le responsable sécurité.
- À faire avant la production :
  - authentification des clients par clé asymétrique (`private_key_jwt`, recommandé par SMART Backend Services) au lieu d'un secret partagé ;
  - réseau privé entre la passerelle et HAPI ;
  - TLS de bout en bout ;
  - ~~journal d'audit FHIR (`AuditEvent`)~~ : fait (PR I). Chaque décision d'accès est tracée par `identite`, et la passerelle rend les traces (`AuditEvent`, `Provenance`) immuables. Reste la trace des accès des futurs services qui liront le dossier.

Sources : SMART App Launch v2 — scopes (https://hl7.org/fhir/smart-app-launch/scopes-and-launch-context.html) ; SMART Backend Services (https://hl7.org/fhir/smart-app-launch/backend-services.html) ; Keycloak — importing a realm, placeholders (https://www.keycloak.org/server/importExport) ; OWASP API Security Top 10 (API1 BOLA, API5 BFLA).
