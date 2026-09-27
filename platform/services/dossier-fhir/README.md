# Service `dossier-fhir`

Dossier médical de Mbolo Santé au format **HL7 FHIR R4** (ADR-0001). **Seul service autorisé à stocker des données de santé.**

## Contenu

| Élément | Rôle |
|---|---|
| `ig/` | Guide d'implémentation en FHIR Shorthand : profils `MboloPatient`, `MboloConsent`, `MboloCondition`, `MboloProvenance`, extension `mode-recueil`, terminologies (catégories de consentement, marqueur `fictif`), exemples **fictifs** |
| `src/` | Paquet `@mbolo/dossier-fhir` : règles de validation appliquées avant envoi au serveur, constructeurs de ressources conformes, jeu de données fictif |
| `tests/invalides/` | Ressources qui **doivent** être rejetées (garde-fous) |
| `scripts/valider-ig.sh` | Compilation (SUSHI) + validation par le validateur officiel HL7 (exécuté en CI) |
| `docker-compose.yml` | Serveur HAPI FHIR local, données fictives, effacé à l'arrêt |

## Règles encodées

- **Principe n°1** (`mbolo-cond-1`) : un diagnostic confirmé ou de consultation ne peut avoir pour auteur qu'un professionnel (`Practitioner`/`PractitionerRole`). Un patient ou un agent IA ne peut déclarer qu'un problème **non confirmé**.
- **Consentement** : une catégorie par consentement (pas de « tout accepter »), date, version du texte présenté, `permit`/`deny`, mode de recueil.
- **Traçabilité** : toute écriture d'agent est accompagnée d'une `Provenance`.
- **Principe n°4** : hors production, toute ressource porte `meta.tag = fictif`.

## Commandes

```bash
pnpm --filter @mbolo/dossier-fhir test        # règles et jeu fictif (Vitest)
pnpm --filter @mbolo/dossier-fhir ig:valider  # compilation + validateur officiel (Java 17+, accès réseau HL7)
docker compose -f platform/services/dossier-fhir/docker-compose.yml up -d   # HAPI FHIR sur http://127.0.0.1:8080/fhir
```

## Limites actuelles (vague 0)

- Pas encore d'authentification SMART on FHIR ni de contrôle d'accès par patient : ils arrivent avec le service `identite` (PR C). **Le serveur local ne doit jamais contenir de données réelles.**
- URL canonique provisoire (`mbolo-sante.example`) ; profils alignés plus tard sur eGabon-SIS si son standard le permet.
