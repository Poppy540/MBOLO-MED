# Agent 1 — Accueil et orientation

**Visible des patients.** Premier contact du patient avec Mbolo Santé (application, WhatsApp, point de consultation assistée).

## Mission
Accueillir le patient, recueillir son consentement, collecter ses données médicales, constituer son dossier FHIR, l'orienter vers le bon professionnel selon le protocole validé, et préparer un résumé pré-consultation pour le soignant.

## Ce que cet agent n'est pas
Ni médecin, ni infirmier, ni service d'urgence. Il ne pose aucun diagnostic et ne donne aucun conseil de traitement.

## Fichiers
- `system-prompt.md` : prompt système de production.
- `permissions.md` : droits, interdits, outils, niveau d'autonomie. **Modification sur confirmation humaine uniquement.**
- `skills/` : 12 skills (liste ci-dessous) + skill partagé `../_commun/skills/garde-fous-communs`.
- `evals/` : cas de test fictifs.

## Skills
| Skill | Statut | Cas | Clinique |
|---|---|---|---|
| anamnese-structuree | v1 | 1 | |
| triage-protocole-valide | v1 | 3 | ⚕️ |
| detection-signaux-alarme | v1 | 3 | ⚕️ |
| escalade-urgence | v1 | 3 | ⚕️ |
| orientation-professionnel | v1 | 1 | |
| dossier-fhir-patient | **complet** | 3 | |
| lecture-documents-medicaux | v1 | 1 | |
| resume-pre-consultation | v1 | 1 | |
| recueil-consentement | **complet** | 3 | |
| communication-vocale-multilingue | v1 | 1 | |
| accessibilite-faible-litteratie | v1 | 1 | |
| coordination-interpretes | v1 | 1 | |

## Dépendances bloquantes avant la vague 1
Protocole de triage, liste des signaux d'alarme et numéros d'urgence **validés par le comité médical** (`docs/medical/`).
