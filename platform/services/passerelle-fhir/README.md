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

| Client Keycloak                  | Service                                                                                            | Permissions (`mbolo_scopes`)                                                                                           | Éléments lisibles (`mbolo_elements`)                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `mbolo-identite-service`         | `identite` (consentements, journal des accès)                                                      | `system/Consent.crus system/AuditEvent.cs`                                                                             | tous                                                                                                                             |
| `mbolo-teleconsultation-service` | `teleconsultation` (rendez-vous, agendas, créneaux, annuaire, statut d'identité, langue) | `system/Appointment.crus system/Schedule.crus system/Slot.crus system/Practitioner.r system/Patient.ru` | `Practitioner.name Practitioner.qualification Practitioner.active Practitioner.extension Patient.extension Patient.communication` ; modifiable : `Patient.communication` |
| `mbolo-consultation-service`     | `consultation` (problèmes, comptes-rendus, ordonnances, rendez-vous et fiche du proche en lecture) | `system/Condition.rs system/Composition.crs system/Appointment.r system/MedicationRequest.crus system/RelatedPerson.r` | tous                                                                                                                             |
| `mbolo-invitations-service`      | `invitations` (fiche du proche invité par le patient, ADR-0019)                                    | `system/RelatedPerson.cru`                                                                                             | tous                                                                                                                             |
| `mbolo-notifications-service`    | `notifications` (numéro, langue, consentement aux rappels)                                         | `system/Patient.r system/Practitioner.r system/Consent.s`                                                              | `Patient.telecom Patient.communication Practitioner.telecom`                                                                     |
| `mbolo-documents-service`        | `documents` (vérification d'identité, ADR-0015)                                                    | `system/Patient.ru system/Consent.s system/AuditEvent.c`                                                               | `Patient.extension Patient.identifier Patient.name Patient.birthDate` ; **modifiables** : `Patient.extension Patient.identifier` |

**Minimisation par élément** : pour un type listé dans `mbolo_elements`, la passerelle impose `_elements` au serveur FHIR, puis **filtre elle-même la réponse** : lecture, recherche et pages suivantes. Seuls sortent `resourceType`, `id`, `meta` et les éléments autorisés, quels que soient les paramètres de la requête. Un type non listé n'est pas restreint.

**Modification par élément** (`mbolo_elements_modifiables`) : pour un type restreint en lecture, une mise à jour (`PUT`) ne peut porter que sur les éléments modifiables du client ; tout autre élément envoyé est refusé (403). La passerelle relit la ressource actuelle, **ne remplace que ces éléments**, conserve tout le reste (que le client n'a jamais vu), valide la ressource complète avec les règles Mbolo, et l'écrit avec un verrou sur la version lue. Un client restreint sans éléments modifiables ne modifie rien.

Ajouter un client (ex. agent IA) : un client confidentiel dans `keycloak/realm-mbolo.json` avec le secret en `${VARIABLE}`, une audience `mbolo-dossier-fhir`, une revendication `mbolo_scopes` **minimale** et, si le client n'a besoin que d'une partie d'une ressource, une revendication `mbolo_elements`. Le responsable sécurité revoit chaque ajout.

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
