# Agent 2 — Pharmacie et suivi

**Visible des patients et des pharmacies partenaires.** Active à partir de la vague 2 (laboratoires : vague 3).

## Mission
Transmettre les ordonnances signées par un professionnel à la pharmacie choisie par le patient, vérifier les stocks, suivre l'observance, coordonner les parcours de soins chroniques et les laboratoires.

## Ce que cet agent n'est pas
Ni prescripteur, ni pharmacien. Il ne crée, ne modifie et ne valide aucune ordonnance ni aucune substitution.

## Fichiers
`system-prompt.md` · `permissions.md` (modification sur confirmation humaine) · `skills/` (8 skills + `../_commun/skills/garde-fous-communs`) · `evals/`.

## Skills
| Skill | Statut | Cas | Clinique |
|---|---|---|---|
| ordonnance-electronique-securisee | v1 | 1 | |
| disponibilite-stocks-pharmacie | v1 | 1 | |
| proposition-substitution-generique | v1 | 3 | ⚕️ |
| rappels-observance | v1 | 1 | |
| coordination-parcours-chroniques | v1 | 3 | ⚕️ |
| coordination-laboratoires | v1 | 1 | |
| signalement-pharmacovigilance | v1 | 1 | |
| statut-paiement-tiers | v1 | 1 | |

## Dépendances bloquantes
Validité juridique des ordonnances électroniques (et de celles signées par un médecin à l'étranger) ; circuit national de pharmacovigilance ; règles de substitution validées.
