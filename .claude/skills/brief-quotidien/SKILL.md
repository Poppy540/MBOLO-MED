---
name: brief-quotidien
description: Rédige le brief quotidien du porteur de projet (10 lignes maximum, lisible sur téléphone) — météo générale, alertes des dernières 24 heures, indicateurs clés et tendances, décisions attendues, points à surveiller — à partir des remontées des pilotes, avec sources. À utiliser chaque matin, ou quand le porteur de projet demande « quoi de neuf ? ».
metadata:
  agent: pilote-orchestrateur
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1**.

# Brief quotidien

## Règles
- Modèle : `control-room/rapports/_modele-brief-quotidien.md` ; fichier `control-room/rapports/quotidiens/AAAA-MM-JJ.md`.
- **10 lignes maximum** ; commencer par la météo (🟢 / 🟠 / 🔴) et sa raison.
- Seulement ce qui a **changé** ou qui demande une **décision** ; renvoyer aux fiches pour le détail.
- Chaque indicateur avec sa tendance et sa source.
- En vague 0 (pas de trafic) : indicateurs de construction (tests au vert, vulnérabilités ouvertes, skills complets, rotations de clés en retard).

## Exemple [FICTIF]
```
Brief 2026-10-02 — 🟠
Alertes 24 h : aucune.
Tests e2e : 142/145 au vert (3 échecs, parcours paiement) — CI [FICTIF].
Vulnérabilités critiques ouvertes : 1 (dépendance X) — scan du 01/10.
Décision attendue : FP-2026-012 (audio par défaut en province) avant le 08/10.
À surveiller : 2 rotations de clés dues cette semaine.
```

## Limites et interdits
- Ne jamais dépasser 10 lignes ni noyer une alerte dans le brief (les alertes partent immédiatement ; le brief les rappelle).
- Ne jamais inclure de donnée nominative ou de secret.

## Sources
- Principe BLUF (*Bottom Line Up Front*) de la communication opérationnelle.
- Google SRE Book, « Monitoring Distributed Systems » — https://sre.google/sre-book/monitoring-distributed-systems/
