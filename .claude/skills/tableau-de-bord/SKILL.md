---
name: tableau-de-bord
description: Conçoit et met à jour le tableau de bord du porteur de projet de Mbolo Santé — une page lisible sur téléphone avec une douzaine d'indicateurs clés (sécurité patient, qualité, accès, technique, sécurité, économie, avancement, risques), leur cible, leur tendance et leur source — et en garantit l'exactitude et la sobriété. À utiliser pour concevoir ou réviser les indicateurs, à chaque mise à jour hebdomadaire, et quand le porteur de projet demande « où en est-on ? ».
metadata:
  agent: pilote-projet
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Tableau de bord du porteur de projet

## Principes
1. **Peu d'indicateurs** (≤ 12), chacun relié à une décision possible.
2. **Sécurité des patients en premier.**
3. Chaque indicateur : valeur, cible, tendance (↑ ↓ →), période, **source**, date de mise à jour.
4. Lisible sur téléphone : une colonne, couleurs + symboles (accessibilité : pas de sens porté par la couleur seule).
5. Pas d'indicateur de vanité (téléchargements seuls, abonnés aux réseaux sociaux).

## Indicateurs proposés
| # | Domaine | Indicateur | Vague 0 | Vague ≥ 1 |
|---|---|---|---|---|
| 1 | Sécurité patient | Escalades d'urgence correctes (évaluations / audits) | Banc d'évaluation | Audit Agent 4 |
| 2 | Sécurité patient | Incidents graves ouverts | ✓ | ✓ |
| 3 | Qualité | Cas de test refus/escalade au vert (%) | ✓ | ✓ |
| 4 | Qualité | Skills requis en statut `complet` (n / total) | ✓ | ✓ |
| 5 | Accès | Consultations réussies (Libreville / province) | — | ✓ |
| 6 | Accès | Satisfaction patients | — | ✓ |
| 7 | Technique | Disponibilité / SLO alerte d'urgence | Recette | ✓ |
| 8 | Sécurité | Vulnérabilités critiques + hautes ouvertes | ✓ | ✓ |
| 9 | Économie | Volume vs business plan ; trésorerie (mois) | Trésorerie | ✓ |
| 10 | Avancement | Jalons du chemin critique à l'heure | ✓ | ✓ |
| 11 | Risques | Risques critiques ouverts | ✓ | ✓ |
| 12 | Décisions | Fiches en attente de décision (dont en retard) | ✓ | ✓ |

## Déroulé
1. Collecter auprès des pilotes (sources lecture seule) ; vérifier les chiffres (recoupement).
2. Mettre à jour `control-room/tableau-de-bord.md` (à créer au premier usage) ; historique conservé.
3. Tout indicateur de sécurité au rouge → vérifier qu'une alerte / fiche existe.

## Exemple [FICTIF]
```
Tableau de bord — 2026-10-06 [FICTIF]
🟢 Escalades correctes : 100 % (60/60) — évaluations nuit du 05/10
🟠 Skills requis complets : 9/14 — frontmatters au 06/10
🔴 Vulnérabilités hautes ouvertes : 2 — scan du 05/10 → FP-2026-015
🟢 Trésorerie : 14 mois — export compta 30/09
```

## Limites et interdits
- Ne jamais afficher un chiffre sans source ni date.
- Ne jamais masquer ou reformuler un indicateur défavorable pour l'embellir.
- Ne jamais inclure de donnée personnelle.

## Sources
- Few S., *Information Dashboard Design* (2e éd., 2013).
- Kaplan R., Norton D., « The Balanced Scorecard », *Harvard Business Review* 1992.
- Doerr J., *Measure What Matters* (2018) — indicateurs reliés aux objectifs.
