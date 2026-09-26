# `secrets/` — inventaire des clés, jamais les valeurs

> **Principe n°5 : aucun secret dans le dépôt.** Ce dossier recense les clés utilisées par la plateforme et par les agents. Il ne contient **aucune valeur réelle**.

## 1. Ce que contient ce dossier

| Élément | Suivi par Git | Contenu |
|---|---|---|
| `README.md` | Oui | Ce document : fonctionnement et procédures |
| `inventaire-cles.md` | Oui | Tableau de toutes les clés : service, agent, portée, rotation, responsable, vague |
| `templates/<service>.env.example` | Oui | Noms des variables, valeurs `CHANGEME` uniquement |
| `local/` | **Non** (ignoré) | Usage strictement local d'un développeur, **jamais lu par Claude Code** |

Les **valeurs réelles** vivent dans un **coffre-fort de secrets** et sont injectées au moment de l'exécution, sous forme de variables d'environnement ou de fichiers montés en mémoire.

## 2. La clé API Claude

La clé API Claude (`ANTHROPIC_API_KEY`) est **exclue de ce dossier**, à la demande du porteur de projet :

- en développement, elle vit uniquement dans la variable d'environnement `ANTHROPIC_API_KEY` du terminal du porteur de projet ;
- en production, elle vit dans le coffre-fort, à un emplacement réservé à l'infrastructure.

Elle n'apparaît dans aucun fichier du dépôt ; gitleaks la détecte (règle `mbolo-anthropic-api-key` dans `.gitleaks.toml`).

## 3. Coffre-fort retenu : Infisical (D-0002, ADR-0005)

- **Infisical**, région UE au démarrage, puis auto-hébergement chez l'hébergeur retenu.
- Organisation : projet `mbolo-sante` ; environnements `dev`, `recette`, `prod` ; un dossier par service (`/paiement-mobile-money/`, `/fhir/`…) — c'est ce que désigne la notation `mbolo/<env>/<service>/` de l'inventaire.
- **Une identité machine par service et par agent**, limitée à son dossier ; authentification par identité de charge de travail (Kubernetes, OIDC) de préférence.
- Journal d'audit du coffre consulté par le responsable sécurité.
- Repli possible : OpenBao / HashiCorp Vault si des secrets dynamiques deviennent nécessaires.

## 4. Règles de base

1. **Une clé par agent et par usage.** Deux agents ne partagent jamais une clé : on peut ainsi révoquer un agent sans couper les autres, et savoir qui a fait quoi.
2. **Portée minimale.** Lecture seule chaque fois que possible ; écriture limitée au strict nécessaire (voir la colonne « Portée » de l'inventaire).
3. **Séparation des environnements.** Dev, recette et production ont des clés distinctes. Les environnements de dev et de recette n'ont **jamais** accès à des données réelles.
4. **Aucun agent IA ne voit une valeur de secret.** Les appels authentifiés passent par un outil (serveur MCP ou service interne) qui injecte la clé côté serveur ; le modèle ne reçoit que le résultat.
5. **Jamais dans un journal.** Les journaux masquent les en-têtes `Authorization`, les jetons et les paramètres sensibles.

## 5. Ajouter une clé

1. Ouvrir une demande de revue qui ajoute une **ligne** dans `inventaire-cles.md` (nom, service, agent, usage, portée, environnement, emplacement, rotation, responsable, vague).
2. Ajouter la variable avec la valeur `CHANGEME` dans `templates/<service>.env.example`.
3. Faire valider la demande par le responsable sécurité.
4. Le responsable humain crée la clé **chez le fournisseur** avec la portée minimale, puis l'enregistre **directement dans le coffre-fort**. La valeur ne transite jamais par Git, un ticket, un e-mail, une messagerie ou une conversation avec une IA.
5. Vérifier en recette que le service fonctionne, puis activer en production.

## 6. Rotation

- Fréquence : celle indiquée dans l'inventaire (par défaut 90 jours ; 30 jours pour les identités d'accès au coffre ; secrets dynamiques quand le coffre le permet).
- Procédure : créer la nouvelle clé → l'enregistrer dans le coffre comme nouvelle version → redéployer ou recharger le service → vérifier → révoquer l'ancienne clé chez le fournisseur → noter la date dans le journal de rotation du coffre.
- L'Agent 6 (sous-agent sécurité) signale les rotations en retard dans le brief quotidien. Il ne fait jamais la rotation lui-même.

## 7. Révocation

Révoquer immédiatement une clé lorsque : un agent ou un service est retiré ; une personne ayant eu accès quitte le projet ; un partenaire est déréférencé ; une fuite est soupçonnée.

## 8. Procédure en cas de fuite (ou de soupçon de fuite)

1. **Révoquer d'abord**, chez le fournisseur, sans attendre l'analyse. Une clé révoquée ne coûte qu'une interruption ; une clé fuitée peut coûter des données de santé.
2. Créer une nouvelle clé et l'enregistrer dans le coffre ; redéployer.
3. Prévenir le **responsable sécurité** et le **porteur de projet** (alerte immédiate, voir `docs/securite/plan-incident.md`).
4. Si la clé a été commitée : la révocation suffit à neutraliser le risque, mais il faut aussi purger l'historique **sur décision humaine** (réécriture d'historique interdite à Claude Code) et invalider les caches ou forks connus.
5. Examiner les journaux d'accès du fournisseur pour la période d'exposition.
6. Si des données personnelles ont pu être exposées : évaluer la notification à l'autorité de protection des données (au Gabon, la CNPDCP créée par la loi n°001/2011 — autorité et délais à confirmer par un juriste ; autorité compétente dans l'UE sous 72 h selon le RGPD, art. 33) et aux personnes concernées.
7. Ouvrir une fiche problématique et consigner les leçons apprises dans `memory.md`.

## 9. Limites des règles de Claude Code — à connaître

`.claude/settings.json` interdit à Claude Code de lire `secrets/local/**`, les fichiers `.env`, `*.pem`, `*.key`, etc. Ces règles sont appliquées **au mieux** par l'outil :

- une commande shell détournée (autre programme, redirection, script) pourrait contourner une règle `Read` ;
- les règles `Bash(...)` reposent sur des préfixes de commande et ne couvrent pas toutes les variantes.

C'est pourquoi la vraie protection est ailleurs : **aucune valeur réelle de secret ne doit jamais se trouver dans le dépôt**, ni même sur un poste où Claude Code travaille, hormis dans le coffre-fort. `secrets/local/` n'est qu'une tolérance pour un usage local ponctuel ; le coffre-fort doit lui être préféré.

De même, l'interdiction de pousser sur `main` doit être doublée d'une **règle de protection de branche GitHub** (revue obligatoire, push direct interdit, force-push interdit).

## 10. Détecteur de secrets (gitleaks + pre-commit)

Installation (une fois par poste) :

```bash
pip install pre-commit          # ou : brew install pre-commit
pre-commit install              # active les contrôles avant chaque commit
pre-commit run --all-files      # contrôle manuel de tout le dépôt
```

Lancement direct de gitleaks (installé séparément : https://github.com/gitleaks/gitleaks#installing) :

```bash
gitleaks detect --source . --config .gitleaks.toml --redact      # historique Git
gitleaks dir . --config .gitleaks.toml --redact                  # fichiers du répertoire
```

Les contrôles bloquent aussi : les fichiers `.env` réels, tout fichier dans `secrets/local/`, les clés privées, et les commits directs sur `main`. Ne jamais contourner avec `--no-verify` (interdit à Claude Code dans `.claude/settings.json`).
