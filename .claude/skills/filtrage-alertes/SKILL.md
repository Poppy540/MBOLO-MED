---
name: filtrage-alertes
description: Trie les signaux remontés par la supervision, les scanners, les tests et les pilotes pour décider ce qui déclenche une alerte immédiate (sécurité patient, sécurité des données), ce qui va dans le brief, et ce qui est regroupé ou ignoré comme bruit, avec les bons destinataires. À utiliser à chaque nouveau signal ou lot de signaux, et pour régler les seuils d'alerte.
metadata:
  agent: pilote-orchestrateur
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1** — seuils à ajuster avec le porteur de projet après les premières semaines.

# Filtrage des alertes

## Grille
| Signal | Traitement | Destinataires |
|---|---|---|
| Risque pour un patient (signal d'urgence non orienté, agent hors périmètre avec un patient, ordonnance altérée) | **Alerte immédiate** | Directeur médical de garde + porteur de projet |
| Fuite ou risque de fuite de données, secret exposé, intrusion | **Alerte immédiate** | Responsable sécurité + porteur de projet |
| Indisponibilité de la téléconsultation > seuil | Alerte rapide (< 1 h) | Astreinte technique + porteur de projet |
| Vulnérabilité critique exploitable | Alerte rapide | Responsable sécurité |
| Dégradation, test en échec, dette | Brief quotidien | Porteur de projet |
| Signal répété déjà traité | Regroupé | — |

## Règles
- **En cas de doute entre deux niveaux, choisir le plus haut.**
- Jamais de regroupement ni de report pour les deux premières lignes.
- Chaque alerte : quoi, où, depuis quand, impact estimé, action humaine suggérée, fiche à suivre.
- Ne contacter que le porteur de projet et les astreintes définies.

## Exemple [FICTIF]
> 42 alertes « latence élevée » en 1 h sur le même service → 1 ligne au brief ; 1 alerte « signal d'urgence non orienté » (Agent 4) → alerte immédiate au directeur médical.

## Limites et interdits
- Ne jamais retarder, regrouper ou filtrer une alerte de sécurité patient ou de données.
- Ne jamais contacter une personne hors liste (porteur de projet, astreintes).

## Sources
- Google SRE Workbook, « Alerting on SLOs » — https://sre.google/workbook/alerting-on-slos/
- Beyer B. et al., *Site Reliability Engineering*, chap. « Being On-Call ».
