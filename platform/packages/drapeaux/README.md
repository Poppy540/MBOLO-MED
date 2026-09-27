# Paquet `@mbolo/drapeaux`

Feature flags des services Mbolo Santé : évaluation côté serveur, **désactivé par défaut**, via **OpenFeature** avec **Unleash** comme fournisseur (ADR-0003, ADR-0007). Registre : `docs/deploiement/flags.md`.

## Utilisation

```ts
import { drapeauxUnleash, drapeauxFixes } from '@mbolo/drapeaux';

const drapeaux = process.env['UNLEASH_API_URL']
  ? await drapeauxUnleash({ url: process.env['UNLEASH_API_URL'], jeton: process.env['UNLEASH_BACKEND_TOKEN'] ?? '', application: 'identite' })
  : await drapeauxFixes(); // tout désactivé

if (await drapeaux.estActif('consentement.proche', { sujet: u.sujet, typeUtilisateur: 'patient' })) { … }
```

- `estActif` n'accepte que les noms du **catalogue** (`src/catalogue.ts`), vérifiés par TypeScript.
- **Dépendances** respectées : un flag dont une dépendance est désactivée est désactivé.
- **Refus par défaut** : Unleash injoignable (attente maximale de 5 s au démarrage), erreur ou nom inconnu → `false`. La dernière configuration reçue est gardée en mémoire, jamais sur disque.
- **Contexte** : `sujet` (identifiant technique du compte, pour une cohorte), `typeUtilisateur`, `ville`, `specialite`, `vague`. Jamais de donnée de santé.

## Ajouter un flag

1. L'ajouter au catalogue avec sa vague, ses dépendances et `branche`.
2. L'ajouter au registre `docs/deploiement/flags.md` : prérequis et retour arrière.
3. Scénarios e2e : fonction activée pour une cohorte, **et** refusée hors cohorte.

## Tests

`pnpm --filter @mbolo/drapeaux test` couvre :
- le catalogue : noms, dépendances connues, pas de cycle, aucun flag de sécurité ;
- les flags fixés ;
- un faux serveur Unleash : ciblage par compte et par ville, jeton, repli désactivé si le serveur est injoignable.
