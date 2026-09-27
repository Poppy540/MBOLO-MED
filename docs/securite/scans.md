# Scans de sécurité automatiques

> Skill de référence : `scans-securite`. Mis à jour à chaque ajout d'outil ou changement de seuil.

## En place

| Contrôle | Outil | Quand | Bloquant |
|---|---|---|---|
| Secrets dans les fichiers et tout l'historique | gitleaks (règles `.gitleaks.toml`) + pre-commit | Chaque commit et chaque PR | Toute fuite |
| Analyse statique du code (SAST) | GitHub CodeQL, règles `security-extended` (`.github/workflows/codeql.yml`) | Chaque PR, chaque fusion, chaque lundi | Alertes visibles dans l'onglet *Security* ; à rendre bloquant par la protection de `main` (porteur de projet) |
| Failles connues des dépendances livrées | `pnpm audit --prod --audit-level high` (job « Dépendances ») | Chaque PR et chaque fusion | Faille **haute ou critique** |
| Failles connues de toutes les dépendances (outils compris) | `pnpm audit --audit-level critical` | Chaque PR et chaque fusion | Faille **critique** |
| Dépendance ajoutée ou mise à jour dans une PR | `actions/dependency-review-action` | Chaque PR | Faille **haute ou critique** |
| Mises à jour disponibles (dont correctifs de sécurité) | Dependabot (`.github/dependabot.yml`) : npm, Maven (extension Keycloak), images docker-compose, actions GitHub | Chaque lundi, et dès qu'une faille est publiée si les alertes sont activées | Non bloquant : une PR par mise à jour, fusionnée après CI verte et revue humaine |
| Garde-fous du dossier médical | Validateur officiel HL7 sur des ressources volontairement invalides (principe n°1, minimisation…) | Chaque PR | Toute régression |

Ces outils interrogent des bases de failles publiques (GitHub Advisory Database, registre npm) ; aucun secret ni donnée n'est envoyé.

## Délais de correction

Une faille connue qui touche un composant livré, ou un serveur de la plateforme (Keycloak, HAPI FHIR, PostgreSQL, LiveKit, Unleash), est corrigée dans ces délais, à compter de sa publication :

| Gravité | Délai | Si aucun correctif n'existe |
|---|---|---|
| Critique | **48 heures** | Mesure de contournement (désactiver la fonction par flag, filtrer au proxy) et alerte immédiate du porteur de projet |
| Haute | **7 jours** | Fiche problématique avec les options et le risque résiduel |
| Modérée | **30 jours** | Inscription ci-dessous, avec la décision |
| Faible | Prochaine mise à jour planifiée | — |

Toute exception est décidée par le porteur de projet et inscrite dans le tableau ci-dessous.

## Failles connues, acceptées temporairement

| Date | Composant | Gravité | Portée | Décision |
|---|---|---|---|---|
| 2026-09-27 | `vitest` et `@vitest/mocker` < 4.1.11 (GHSA-82fw-gwwq-j7x9, lecture de fichiers par traversée de chemin) | Modérée | Outil de test uniquement, jamais livré ni exposé | Passage à Vitest 4 (version majeure) à valider par le porteur de projet |

## À venir (avant la vague 1)

- Activer, dans les réglages du dépôt, les **alertes Dependabot** et les **mises à jour de sécurité Dependabot** (porteur de projet) : la PR de correctif est alors ouverte dès la publication d'une faille, sans attendre le lundi.

- Rendre obligatoires, dans la protection de `main`, les contrôles ci-dessus (décision du porteur de projet).
- Analyse des images de conteneurs (Trivy) dès que les services seront empaquetés.
- Analyse dynamique (OWASP ZAP) sur l'environnement de recette.
- Test d'intrusion externe (critère de la vague 0).
- Liste des composants (SBOM) jointe à chaque livraison.
