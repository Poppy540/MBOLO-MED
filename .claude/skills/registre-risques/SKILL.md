---
name: registre-risques
description: Tient le registre des risques de Mbolo Santé (control-room/risques/registre-risques.md) — identification, évaluation probabilité × impact, signaux d'alerte, mesures, responsable, échéance, statut — le revoit chaque semaine, relie les risques aux fiches, incidents et menaces, et signale toute aggravation. À utiliser chaque semaine, dès qu'un nouveau risque est identifié par un pilote, un incident ou un retour terrain, et pour préparer une revue de vague.
metadata:
  agent: pilote-projet
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Registre des risques

## Échelles
- **Probabilité** : 1 rare · 2 peu probable · 3 possible · 4 probable · 5 quasi certain (sur l'horizon de la vague).
- **Impact** : 1 négligeable · 2 mineur · 3 modéré · 4 majeur · 5 critique. Pour la sécurité des patients, un risque de préjudice grave est **toujours ≥ 4**.
- **Criticité = P × I** : ≥ 15 critique · 8–14 élevée · 4–7 moyenne · ≤ 3 faible.

## Catégories
Sécurité patient · Sécurité / données · Juridique / conformité · Technique · Exploitation · Économique · Organisation / humain · Institutionnel · Partenaires.

## Revue hebdomadaire
1. Pour chaque risque ouvert : les **signaux d'alerte** se sont-ils manifestés ? Les mesures avancent-elles ? Réévaluer P et I avec justification.
2. Intégrer les nouveaux risques remontés (pilotes, Agent 4 via rapports, incidents, menaces STRIDE critiques, retours terrain).
3. **Criticité en hausse** ou passage en « critique » → fiche problématique + mention dans le brief.
4. Risque réalisé → devient un incident / problème (fiche) ; le risque est mis à jour.
5. Consigner chaque modification dans le **journal** en bas du registre.
6. Ne clore un risque que si la cause a disparu ou si le porteur de projet **accepte** explicitement le risque résiduel (décision tracée).

## Format d'une ligne
Voir l'en-tête du registre : ID, risque, catégorie, P, I, criticité, signaux d'alerte, mesures (prévention / atténuation), responsable (rôle), échéance, statut.

## Exemple [FICTIF]
> R-04 Connectivité en province : P 5 → 5, I 3 → 4 (tests terrain T3 : 45 % d'échecs vidéo en zone rurale, impact accru sur l'accès aux soins) → criticité 15 → 20 → fiche FP-2026-012 ; journal mis à jour.

## Limites et interdits
- Ne jamais baisser une criticité sans justification factuelle.
- Ne jamais clore un risque sans cause disparue ou acceptation explicite du porteur de projet.
- Ne jamais inscrire de nom de personne ni de donnée personnelle (rôles uniquement).

## Sources
- ISO 31000:2018, *Management du risque — Lignes directrices*.
- ISO 14971:2019 (risques des dispositifs médicaux) — logique de gravité pour le patient.
- PMI, *The Standard for Risk Management in Portfolios, Programs, and Projects* (2019).
