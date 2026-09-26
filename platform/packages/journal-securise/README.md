# @mbolo/journal-securise

Journalisation structurée (JSON, une ligne par événement) pour tous les services de Mbolo Santé.

**Pourquoi :** principe n°3 (protection des données de santé) et n°5 (aucun secret). Un journal est souvent copié vers des outils tiers (supervision, support) : il ne doit contenir **ni secret, ni donnée de santé, ni donnée d'identification**.

## Ce qui est masqué

| Catégorie | Clés concernées (insensible à la casse, `_` et `-` ignorés) | Remplacé par |
|---|---|---|
| Secrets | `password`, `motdepasse`, `secret`, `token`, `apikey`, `authorization`, `cookie`, `clientsecret`… | `[SECRET MASQUÉ]` |
| Données sensibles | `nom`, `prenom`, `name`, `telephone`, `phone`, `email`, `adresse`, `dateNaissance`, `birthDate`, `diagnostic`, `symptomes`, `message`, `note`, `contenu`… | `[DONNÉE SENSIBLE MASQUÉE]` |
| Motifs dans le texte libre | Jetons `Bearer …`, clés `sk-…`, numéros de téléphone, adresses e-mail | `[MASQUÉ]` |

La liste est volontairement **large** : en cas de doute, on masque.

## Usage

```ts
import { creerJournal } from '@mbolo/journal-securise';

const journal = creerJournal({ service: 'identite' });
journal.info('consentement enregistré', { patientId: 'fictif-0001', categorie: 'C-SOINS' });
// {"horodatage":"…","niveau":"info","service":"identite","message":"consentement enregistré","contexte":{"patientId":"fictif-0001","categorie":"C-SOINS"}}
```

Les identifiants techniques pseudonymes (`patientId`, `encounterId`) restent visibles pour permettre le suivi ; les données qui permettent d'identifier ou de soigner la personne ne le sont jamais.
