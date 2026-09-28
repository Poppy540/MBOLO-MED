# Supervision (ADR-0016)

Règles d'alerte de Mbolo Santé, versionnées avec le code.

- **Source unique** : `src/regles.ts`. Les fichiers `regles/loki.yaml` et `regles/prometheus.yaml` en sont **générés** (`pnpm --filter @mbolo/supervision generer`) ; un test échoue s'ils ne sont pas à jour.
- **Événements comptés** : chaque service écrit, via `signalerAlerte` (`@mbolo/journal-securise`), un champ `alerte` stable dans le contexte de son journal JSON : `consultation-photo`, `bris-de-glace`, `acces-refuse`, `limite-appels`, `erreur-serveur`. Aucun nom ni donnée de santé : le contexte est masqué comme tout le journal.
- **Loki** : le collecteur (Grafana Alloy ou Promtail) étiquette les journaux des services `app="mbolo-sante"` ; les règles lisent `| json | contexte_alerte="…"`.
- **Prometheus** : un exportateur blackbox sonde `/sante` de chaque service (tâche `mbolo-sante`).
- **Destinataires** : des rôles (`responsable-securite`, `revue-acces`, `astreinte-technique`), routés vers Grafana OnCall ; les titulaires sont désignés par le porteur de projet, jamais écrits ici.

| Alerte | Seuil | Gravité | Destinataire |
|---|---|---|---|
| `ConsultationsPhotosAnormales` | plus de 60 photos en 1 h par vérificateur | critique | responsable sécurité |
| `BrisDeGlace` | chaque accès d'urgence | normale | relecteur des accès |
| `AccesRefusesEnRafale` | plus de 20 refus en 5 min par compte ou service | critique | responsable sécurité |
| `LimitesAppelsDepassees` | plus de 100 requêtes refusées en 5 min | normale | astreinte technique |
| `ErreursServeur` | plus de 10 erreurs internes en 5 min par service (provisoire : 1 % quand les métriques de requêtes existeront) | normale | astreinte technique |
| `ServiceInjoignable` | `/sante` muet pendant 2 min | critique | astreinte technique |

**Reste à faire** (avec l'hébergeur) : déployer Loki, Prometheus et OnCall ; métriques de requêtes pour le taux d'erreurs ; relance d'un bris de glace non revu à 24 h (aujourd'hui : liste des retards dans l'espace de revue).
