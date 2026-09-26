# D-0002 — Choix des outils d'infrastructure

- **Date :** 2026-09-26
- **Décideur :** porteur de projet
- **Fiche(s) liée(s) :** —
- **Statut :** validée (hébergement **sous réserve de l'avis juridique**)

## Décision
| Besoin | Choix | Alternative de repli | ADR |
|---|---|---|---|
| Hébergement des données de santé | **OVHcloud, offre certifiée HDS, en France** — sous réserve de l'avis juridique sur la localisation au Gabon | AWS ou Azure (régions françaises HDS) ; hébergeur au Gabon si la loi l'exige | [ADR-0004](../../docs/architecture/adr/0004-hebergement-donnees-sante.md) |
| Coffre-fort de secrets | **Infisical** (offre hébergée UE au démarrage, auto-hébergement ensuite) | OpenBao / HashiCorp Vault | [ADR-0005](../../docs/architecture/adr/0005-coffre-fort-secrets.md) |
| Messagerie de la salle de contrôle | **Slack** + **outil d'astreinte avec appel / SMS** (Grafana OnCall) pour les alertes critiques | Telegram | [ADR-0006](../../docs/architecture/adr/0006-messagerie-salle-de-controle.md) |
| Feature flags | **Unleash** (via le standard OpenFeature) | Flagsmith | [ADR-0007](../../docs/architecture/adr/0007-feature-flags-unleash.md) |

## Raisons
Choix réversibles, majoritairement open source ou européens, adaptés à une petite équipe, compatibles avec les principes du projet (données de santé protégées, une clé par agent, humain dans la boucle, alertes critiques fiables).

## Conséquences et actions
| Action | Responsable (rôle) | Échéance |
|---|---|---|
| Obtenir l'avis juridique sur la localisation des données de santé (condition de l'ADR-0004) | Porteur de projet | Avant vague 1 |
| Demander devis et contrat HDS à OVHcloud ; vérifier clauses (non-réutilisation, réversibilité, localisation) | Porteur de projet + responsable sécurité | Avant vague 1 |
| Ouvrir le compte Infisical (région UE), créer le projet `mbolo-sante` et les environnements dev / recette / prod | Responsable sécurité | Vague 0 |
| Créer l'espace Slack, les canaux et l'astreinte Grafana OnCall | Porteur de projet | Vague 0 |
| Installer Unleash en recette | Responsable technique | Vague 0 |
| Vérifier tarifs et contrats de chaque fournisseur avant engagement | Porteur de projet | Avant tout engagement |

## Mise à jour de `memory.md`
- [x] Ligne ajoutée dans « Décisions validées »
