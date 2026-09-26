# ADR-0003 — Déploiement progressif par feature flags

- **Date :** 2026-09-26
- **Statut :** acceptée ; outil (Unleash, Flagsmith, GrowthBook ou interne) à choisir

## Décision
- Chaque fonction activable par **ville**, **spécialité** et **type d'utilisateur**.
- Évaluation côté serveur ; valeur par défaut = **désactivé** ; journalisation de chaque changement (qui, quand, pourquoi).
- Modification en production réservée à un humain habilité ; l'Agent 6 n'a qu'une clé en lecture seule.
- Nettoyage des flags obsolètes après stabilisation d'une vague.
