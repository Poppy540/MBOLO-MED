---
name: gestion-secrets
description: Surveille la bonne gestion des secrets de Mbolo Santé sans jamais en voir la valeur — cohérence entre secrets/inventaire-cles.md, les modèles .env.example et le coffre-fort, portée minimale, une clé par agent, rotations à échéance, révocations, détection de fuite et procédure d'urgence. À utiliser quand une clé est ajoutée ou retirée, chaque semaine pour les échéances de rotation, et immédiatement en cas de secret exposé.
metadata:
  agent: pilote-securite
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Gestion des secrets

## Règle d'or
Le pilote sécurité ne **voit jamais** une valeur de secret. Il travaille sur les **métadonnées** : nom, emplacement, portée, propriétaire, date de création, date de dernière rotation. Il ne lit pas `secrets/local/`, les fichiers `.env`, `*.pem`, `*.key` (interdit par `.claude/settings.json`).

## Contrôles hebdomadaires
1. **Cohérence** : chaque variable de `secrets/templates/*.env.example` figure dans `secrets/inventaire-cles.md`, et inversement.
2. **Modèles propres** : toutes les valeurs des modèles valent `CHANGEME` (règle gitleaks `mbolo-valeur-reelle-dans-modele`).
3. **Une clé par agent** : aucune variable partagée entre deux agents.
4. **Portée minimale** : pour chaque clé, la portée décrite est la plus restreinte possible ; toute clé « admin » est justifiée.
5. **Rotations** : à partir des métadonnées du coffre (quand il sera choisi), lister les clés dont l'échéance est dépassée ou arrive dans les 14 jours → brief quotidien.
6. **Clé API Claude** : absente de l'inventaire et de tout fichier (gitleaks).
7. **Historique Git** : scan gitleaks complet hebdomadaire.

## Procédure en cas de secret exposé (résumé de `secrets/README.md` §8)
1. **Alerte immédiate** au responsable sécurité et au porteur de projet (type de clé, emplacement, période d'exposition — **pas la valeur**).
2. Recommander la **révocation immédiate** chez le fournisseur par l'humain responsable (colonne « Resp. » de l'inventaire), puis création d'une nouvelle clé dans le coffre.
3. Analyse des journaux du fournisseur sur la période.
4. Purge de l'historique Git **sur décision humaine** (la réécriture d'historique est interdite à Claude Code).
5. Si des données personnelles ont pu être exposées : `reponse-incident` et évaluation des notifications.
6. Fiche problématique + leçon apprise dans `memory.md`.

## Ajout d'une clé
Vérifier que la demande de revue contient : ligne d'inventaire complète, modèle `CHANGEME`, portée minimale, responsable humain, vague ; et **aucune valeur**.

## Exemple [FICTIF]
> Contrôle S41 [FICTIF] : `LAB_PARTNER_API_KEY_AGENT02` présente dans le modèle mais absente de l'inventaire → correction proposée ; 2 rotations à échéance (`WEBRTC_API_SECRET`, `CRM_API_TOKEN_AGENT03`) → brief.

## Limites et interdits
- Ne jamais lire, afficher, copier, journaliser ou transmettre une valeur de secret.
- Ne jamais faire soi-même une rotation, une révocation ou une réécriture d'historique : préparer, alerter, l'humain agit.
- Ne jamais demander à quelqu'un de coller un secret dans une conversation.

## Sources
- OWASP Secrets Management Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- NIST SP 800-57 Part 1 Rev. 5, *Recommendation for Key Management* — https://doi.org/10.6028/NIST.SP.800-57pt1r5
- GitHub, « Removing sensitive data from a repository » — https://docs.github.com/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
