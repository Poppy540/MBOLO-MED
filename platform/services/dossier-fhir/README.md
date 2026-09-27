# Service `dossier-fhir`

Dossier médical de Mbolo Santé au format **HL7 FHIR R4** (ADR-0001). **Seul service autorisé à stocker des données de santé.**

## Contenu

| Élément | Rôle |
|---|---|
| `ig/` | Guide d'implémentation en FHIR Shorthand : profils `MboloPatient`, `MboloConsent`, `MboloCondition`, `MboloProvenance`, `MboloRendezVous` (téléconsultation, sans motif), extensions `mode-recueil` et `date-annulation`, terminologies (catégories de consentement, mode de consultation, auteur d'annulation, marqueur `fictif`), exemples **fictifs** |
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

- Le service `identite` enregistre les consentements (`Consent`) dans ce serveur et décide des accès (ADR-0009). Le serveur HAPI n'est jamais exposé : les services y accèdent par la **passerelle** `services/passerelle-fhir` (jetons de service, permissions SMART, ADR-0010). **Le serveur local ne doit jamais contenir de données réelles.**
- HAPI garde les résultats de recherche en cache 60 s par défaut : tout client qui décide d'un accès doit chercher avec `Cache-Control: no-cache`.
- URL canonique provisoire (`mbolo-sante.example`) ; profils alignés plus tard sur eGabon-SIS si son standard le permet.
