# Service `passerelle-fhir`

**Seul point d'entrée des services vers le dossier médical FHIR** (ADR-0010). Le serveur HAPI (`services/dossier-fhir`) n'est jamais exposé.

## Ce que fait la passerelle, à chaque requête

1. **Jeton de service** Keycloak vérifié : signature, émetteur et audience `mbolo-dossier-fhir`. Sinon **401**.
2. **Permission SMART** (`system/<Type>.<cruds>`, revendication `mbolo_scopes`) pour le type et l'interaction. Sinon **403**.
   - c = créer, r = lire, u = mettre à jour, s = rechercher.
   - La suppression n'est jamais relayée.
3. **Recherche** : `_include`, `_revinclude`, `_has` et les paramètres chaînés sont refusés (**403**). Une réponse qui contiendrait un type hors permission est bloquée.
4. **Écriture** : la ressource doit correspondre à l'adresse, puis passer les règles `@mbolo/dossier-fhir`. Sinon **422**, avec les règles violées.
5. **Journal** : client, interaction, type, statut. Jamais de contenu médical ni de jeton.

Les **traces** (`AuditEvent`, `Provenance`) ne sont jamais modifiables, quelles que soient les permissions : le journal des accès est immuable.

Tout le reste est refusé : `DELETE`, `_history`, `$opérations`, transactions et `metadata`.

## Clients et permissions

| Client Keycloak | Service | Permissions |
|---|---|---|
| `mbolo-identite-service` | `identite` (consentements, journal des accès) | `system/Consent.crus system/AuditEvent.cs` |

Ajouter un client (ex. agent IA) : un client confidentiel dans `keycloak/realm-mbolo.json` avec le secret en `${VARIABLE}`, une audience `mbolo-dossier-fhir` et une revendication `mbolo_scopes` **minimale**. Le responsable sécurité revoit chaque ajout.

## Commandes

```bash
pnpm --filter @mbolo/passerelle-fhir test
KEYCLOAK_ISSUER=http://127.0.0.1:8081/realms/mbolo FHIR_AMONT_URL=http://127.0.0.1:8080/fhir pnpm --filter @mbolo/passerelle-fhir start   # port 3002
```

## Limites (vague 0)

- Ne démarre pas en production.
- Avant la production :
  - authentification des clients par clé asymétrique (`private_key_jwt`) ;
  - réseau privé vers HAPI ;
  - TLS ;
  - trace (`AuditEvent`) de chaque lecture de données cliniques par les futurs services (les décisions d'accès sont déjà tracées par `identite`).
