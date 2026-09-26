---
name: scans-securite
description: Organise, lance (localement ou en CI, dans le cadre des permissions) et analyse les scans de sécurité de Mbolo Santé — secrets (gitleaks), analyse statique SAST (semgrep), dépendances et conteneurs (trivy, npm audit, SBOM), analyse dynamique DAST en recette (OWASP ZAP) — trie les résultats, élimine les faux positifs de façon justifiée et suit la correction selon des délais par gravité. À utiliser à chaque demande de fusion, chaque nuit, avant chaque vague, et quand une nouvelle vulnérabilité publique touche une dépendance.
metadata:
  agent: pilote-securite
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Scans de sécurité

## Outils et moments
| Type | Outil (proposé) | Quand | Commande locale indicative |
|---|---|---|---|
| Secrets | gitleaks (+ pre-commit) | Chaque commit, chaque PR, historique complet chaque semaine | `gitleaks dir . --config .gitleaks.toml --redact` · `gitleaks detect --source . --config .gitleaks.toml --redact` |
| SAST | semgrep (règles OWASP, secrets, langages utilisés) | Chaque PR | `semgrep scan --config auto --error` |
| Dépendances / SCA | trivy fs, npm audit, génération d'un SBOM (CycloneDX) | Chaque PR + chaque nuit | `trivy fs --scanners vuln,secret,misconfig .` · `npm audit --audit-level=high` |
| Conteneurs / IaC | trivy image / config | Chaque build | `trivy config .` |
| DAST | OWASP ZAP (baseline puis complet) | Recette uniquement, chaque semaine et avant vague | *(en CI sur l'environnement de recette)* |

Les commandes réseau ou d'installation passent par une confirmation humaine (`.claude/settings.json`).

## Délais de correction (proposition à valider)
| Gravité | Délai | Bloque la fusion ? | Bloque une vague ? |
|---|---|---|---|
| Critique (ou secret exposé) | **Immédiat** (révocation) / 48 h | Oui | Oui |
| Haute | 7 jours | Oui | Oui |
| Moyenne | 30 jours | Non | Si liée aux données de santé |
| Faible | 90 jours | Non | Non |

## Déroulé
1. Lancer / récupérer les résultats.
2. **Trier** : dédoublonner ; vérifier l'exploitabilité dans le contexte ; ajuster la gravité avec justification écrite.
3. **Faux positif** : documenté (pourquoi, par qui, date) dans la configuration de l'outil ; jamais de désactivation globale d'une règle sans validation du responsable sécurité.
4. **Secret détecté** → procédure `gestion-secrets` (révoquer d'abord) + alerte immédiate au responsable sécurité ; rapporter fichier/ligne/type, **jamais la valeur**.
5. Suivre dans le tableau de bord (vulnérabilités ouvertes par gravité, âge moyen) ; délais dépassés → fiche.

## Exemple [FICTIF]
> Nuit du 2026-10-03 [FICTIF] : trivy — 1 haute (bibliothèque de parsing d'images, exploitable via photo envoyée par un patient) → bloquante, ticket, délai 7 jours ; 3 moyennes ; 0 secret.

## Limites et interdits
- Ne jamais afficher, copier ou journaliser la valeur d'un secret détecté (toujours `--redact`).
- Ne jamais lancer de DAST contre la production ou un tiers.
- Ne jamais désactiver un scanner ou une règle pour faire passer une PR.

## Sources
- gitleaks — https://github.com/gitleaks/gitleaks
- Semgrep — https://semgrep.dev/docs/ ; Trivy — https://trivy.dev/ ; OWASP ZAP — https://www.zaproxy.org/
- OWASP DevSecOps Guideline — https://owasp.org/www-project-devsecops-guideline/
- CycloneDX SBOM — https://cyclonedx.org/ ; FIRST CVSS v4.0 — https://www.first.org/cvss/
