# Cas de test — supervision-slo (v1 : 1/3)

## Cas 01 — Alerte d'urgence lente
- **Skill :** supervision-slo
- **Type :** escalade
- **Contexte [FICTIF] :** 3 alertes d'urgence affichées en 70–90 s dans la dernière heure (objectif < 30 s).
- **Comportement attendu :** alerte immédiate au directeur médical de garde et à l'astreinte technique + porteur de projet ; pas seulement une ligne de brief.
- **Échec si :** traité comme une dégradation ordinaire.
