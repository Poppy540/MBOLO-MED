# Service `identite`

Authentification, rôles, **contrôle d'accès par patient** et **consentements** de Mbolo Santé (ADR-0009).

## Contenu

| Élément | Rôle |
|---|---|
| `src/acces.ts` | Point de décision d'accès au dossier d'un patient. **Refus par défaut.** |
| `src/consentements.ts` | Enregistrer, lister, révoquer un consentement (ressources FHIR `Consent` construites et vérifiées par `@mbolo/dossier-fhir`) |
| `src/jeton.ts` | Vérification des jetons Keycloak (signature, émetteur, audience, expiration) |
| `src/serveur.ts` | API HTTP (Fastify) : `/patients/:id/consentements`, `/consentements/:id/revocation`, `/acces/dossier` |
| `keycloak/realm-mbolo.json` | Royaume « mbolo » : rôles, clients (PKCE), protection contre la force brute, politique de mot de passe |
| `keycloak/profil-utilisateur.json` | Profil utilisateur : identifiants FHIR **modifiables par un administrateur uniquement** |
| `docker-compose.yml` | Keycloak local (comptes fictifs) |

## Règles d'accès au dossier d'un patient

| Qui | Accès | Condition |
|---|---|---|
| Patient | Son dossier | Toujours, et seulement le sien |
| Professionnel, infirmier | Dossier du patient | Consentement `C-PARTAGE-PRO` actif **qui le désigne** ; ou **bris de glace** avec motif écrit → accès accordé **et signalé** pour revue humaine |
| Proche (dont diaspora) | Dossier du patient | Consentement `C-PROCHE` actif **qui le désigne** (« payer n'est pas voir ») |
| Agent IA | Patient de sa session uniquement | Consentement `C-SOINS` actif ; pas de bris de glace |
| Pharmacien, administrateur | Aucun | Les ordonnances passeront par un service dédié |

Seul le patient (ou l'agent de sa session) peut donner, consulter ou retirer ses consentements. Une révocation prend effet immédiatement ; la ressource est conservée (`inactive`) pour la traçabilité.

## ⚠️ Sécurité : identifiants FHIR des comptes

Les revendications `patient_id`, `practitioner_id`, `related_person_id` du jeton déterminent **à quel dossier** un compte est rattaché. Elles doivent être **posées par un administrateur habilité** après vérification, **jamais modifiables par l'utilisateur**. Après import du royaume : *Realm settings → User profile → JSON editor* → coller `keycloak/profil-utilisateur.json` (droits `edit: ["admin"]`).

## MFA

Obligatoire pour professionnel, infirmier, pharmacien, administrateur : action requise **Configure OTP** posée à la création du compte (vague 0). Un flux d'authentification conditionnel par rôle sera configuré et testé avant la vague 1 (Keycloak n'a pas pu être démarré dans l'environnement de Claude Code : `quay.io` bloqué).

## Commandes

```bash
pnpm --filter @mbolo/identite test     # 31 tests : accès, consentements, API (jetons signés par des clés de test)
KC_BOOTSTRAP_ADMIN_PASSWORD=… docker compose -f platform/services/identite/docker-compose.yml up -d
KEYCLOAK_ISSUER=http://127.0.0.1:8081/realms/mbolo pnpm --filter @mbolo/identite start
```

## Limites (vague 0)

- Dépôt de consentements **en mémoire** : le service refuse de démarrer en production. Le stockage FHIR arrive avec la passerelle du dossier.
- Comptes de service des agents IA (un client par agent, portée minimale) : avec l'intégration des agents.
