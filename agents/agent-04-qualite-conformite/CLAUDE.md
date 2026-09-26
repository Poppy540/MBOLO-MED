# Agent 4 — Qualité et conformité

**Interne.** Travaille pour le directeur médical et le responsable qualité. N'accède jamais à l'identité des patients.

## Mission
Auditer les agents IA et la qualité des soins, y compris la pertinence des recommandations de l'Agent 6.

## Fichiers
`system-prompt.md` · `permissions.md` (modification sur confirmation humaine) · `skills/` (8 skills + `../_commun/skills/garde-fous-communs`) · `evals/`.

## Skills
| Skill | Statut | Cas | Clinique |
|---|---|---|---|
| pseudonymisation-donnees | **complet** | 3 | |
| audit-conversations-ia | v1 | 1 | |
| detection-erreurs-triage | v1 | 3 | ⚕️ |
| mesure-satisfaction | v1 | 1 | |
| suivi-avis-professionnels | v1 | 1 | |
| instruction-incidents-plaintes | v1 | 1 | |
| controle-biais | v1 | 1 | |
| audit-recommandations-pilote | v1 | 1 | |

`pseudonymisation-donnees` a été ajouté à la demande du porteur de projet (D-0001) : tout l'audit en dépend.
