---
name: suivi-budget-business-plan
description: Compare chaque mois le réel (dépenses, revenus, volumes de consultations, abonnements, partenariats, reversements aux professionnels) au tableur de référence docs/business-plan/Mbolo_Sante_Business_Plan.xlsx, calcule les écarts et les indicateurs clés (coût et marge par consultation, point mort, trésorerie), explique les écarts et propose des options, sans jamais modifier le tableur. À utiliser chaque mois, avant une décision de dépense ou de prix, et quand un écart dépasse le seuil.
metadata:
  agent: pilote-projet
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Suivi du budget et du business plan

## Référence
Le tableur `docs/business-plan/Mbolo_Sante_Business_Plan.xlsx` **fait foi** et n'est modifié qu'avec validation du porteur de projet. Tant qu'il n'est pas ajouté, utiliser uniquement les hypothèses de `docs/business-plan/README.md` et le signaler.

## Hypothèses de référence (D-0001)
MG 10 000 FCFA · spécialisée 15 000 FCFA · Diaspora « Famille » 25 €/mois · partenariat pharmacie 50 000 FCFA/mois · **55 %** du prix d'une consultation reversé au professionnel · rentabilité année 3 · point mort de l'année 3 à ~75 % du volume prévu.

## Indicateurs mensuels
| Indicateur | Calcul |
|---|---|
| Volume de consultations (MG / spécialisées) | Réel vs prévu (%) |
| Revenu net Mbolo par consultation | Prix × 45 % − frais de paiement − coûts variables (vidéo, SMS, IA, voix) |
| Abonnements Diaspora actifs, attrition | Réel vs prévu |
| Partenariats pharmacie actifs | Réel vs prévu |
| Coûts fixes | Réel vs prévu par poste |
| Marge sur coûts variables, résultat | Réel vs prévu |
| Trésorerie et mois de trésorerie restants | — |
| Distance au point mort | Volume réel / volume de point mort |

Conversion €/FCFA : parité fixe **1 € = 655,957 FCFA** (zone CFA / CEMAC).

## Déroulé
1. Collecter les données réelles (lecture seule : exports comptables, paiement, tableaux de bord), **agrégées**, sans donnée personnelle.
2. Calculer écarts et indicateurs ; distinguer écart de **volume**, de **prix**, de **coût** et de **calendrier**.
3. Écart > **15 %** sur un poste significatif ou dérive de la trésorerie → fiche problématique avec options (ajuster, reporter, chercher un financement, revoir une hypothèse) ; **la décision reste au porteur de projet**.
4. Proposer, s'il y a lieu, une **mise à jour d'hypothèse** du tableur sous forme de note (jamais de modification directe).

## Exemple [FICTIF]
> Octobre [FICTIF] : 820 consultations MG (prévu 1 000, −18 %) ; revenu net par consultation MG : 10 000 × 45 % = 4 500 FCFA − paiement 2 % (200) − variables 900 = **3 400 FCFA** (prévu 3 600) ; SMS +40 % → fiche avec option « WhatsApp pour rappels consentis ».

## Limites et interdits
- Ne jamais modifier le tableur de référence ni ses hypothèses.
- Ne jamais engager, approuver ou différer une dépense ; ne jamais modifier un prix ou le taux de reversement.
- Ne jamais présenter une projection comme un résultat ; indiquer les hypothèses.

## Sources
- Osterwalder A., Pigneur Y., *Business Model Generation* (2010) — structure revenus/coûts.
- OHADA, *Système comptable OHADA (SYSCOHADA révisé)* — référentiel comptable applicable au Gabon.
- BEAC, parité fixe FCFA/euro — https://www.beac.int/
