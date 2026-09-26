# ADR-0006 — Messagerie de la salle de contrôle : Slack + astreinte

- **Date :** 2026-09-26
- **Statut :** acceptée (D-0002)

## Contexte
L'Agent 6 envoie au porteur de projet des briefs, rapports et alertes. Les alertes de sécurité patient et de sécurité des données doivent atteindre un humain **à coup sûr**. La salle de contrôle ne manipule aucune donnée nominative.

## Options envisagées
1. **Slack** — canaux, fils par fiche, intégrations natives GitHub / Sentry / Grafana, historique.
2. **Telegram** — gratuit, léger en 3G ; moins structuré ; messages de bot non chiffrés de bout en bout.
3. **Microsoft Teams** — pertinent si l'organisation utilise déjà Microsoft 365.

## Décision
Slack pour la communication courante, **doublé d'un outil d'astreinte** (Grafana OnCall, ou PagerDuty) qui **appelle ou envoie un SMS** pour les alertes critiques.

## Canaux
| Canal | Usage |
|---|---|
| `#alertes-patients` | Alertes sécurité patient (+ astreinte directeur médical) |
| `#alertes-securite` | Alertes sécurité des données (+ astreinte responsable sécurité) |
| `#brief` | Brief quotidien, rapport hebdomadaire |
| `#fiches` | Une conversation par fiche problématique |
| `#decisions` | Décisions du porteur de projet |

## Conséquences
- Le bot de l'Agent 6 n'écrit que dans ces canaux (portée minimale), ne lit pas les messages privés.
- Aucune donnée nominative ni secret dans les messages (déjà imposé par les skills).
- Une alerte critique ne dépend jamais du seul chat : l'astreinte appelle.
- Plan d'incident (`docs/securite/plan-incident.md`) mis à jour.

Sources : Slack, sécurité des applications et portées OAuth — https://api.slack.com/scopes ; Grafana OnCall — https://grafana.com/docs/oncall/latest/
