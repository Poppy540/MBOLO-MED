# Scans de sécurité automatiques

> Skill de référence : `scans-securite`. Mis à jour à chaque ajout d'outil ou changement de seuil.

## En place

| Contrôle | Outil | Quand | Bloquant |
|---|---|---|---|
| Secrets dans les fichiers et tout l'historique | gitleaks (règles `.gitleaks.toml`) + pre-commit | Chaque commit et chaque PR | Toute fuite |
| Analyse statique du code (SAST) | Semgrep 1.179.0, dossiers `security` des règles `semgrep/semgrep-rules` épinglées à un commit, pour TypeScript, JavaScript et Java (`scripts/semgrep.sh`, `.github/workflows/semgrep.yml`) ; fichiers de test exclus ; faux positif marqué `nosemgrep -- <justification>` et relu en PR | Chaque PR, chaque fusion, chaque lundi | Gravité **ERROR ou WARNING** |
| Failles connues des dépendances livrées | `pnpm audit --prod --audit-level high` (job « Dépendances ») | Chaque PR et chaque fusion | Faille **haute ou critique** |
| Failles connues de toutes les dépendances (outils compris) | `pnpm audit --audit-level critical` | Chaque PR et chaque fusion | Faille **critique** |
| Mises à jour disponibles (dont correctifs de sécurité) | Dependabot (`.github/dependabot.yml`) : npm, Maven (extension Keycloak), images docker-compose, actions GitHub | Chaque lundi, et dès qu'une faille est publiée si les alertes sont activées | Non bloquant : une PR par mise à jour, fusionnée après CI verte et revue humaine |
| Garde-fous du dossier médical | Validateur officiel HL7 sur des ressources volontairement invalides (principe n°1, minimisation…) | Chaque PR | Toute régression |

Ces outils interrogent des bases de failles publiques (GitHub Advisory Database, registre npm) ; aucun secret ni donnée n'est envoyé.

### Dépôt privé : CodeQL et revue des dépendances retirés (2026-10-03)

Le dépôt est passé en privé le 2026-10-03. Sur un dépôt privé, GitHub CodeQL et `actions/dependency-review-action` exigent GitHub Code Security (payant) : ils échouaient sur chaque PR. Décision du porteur de projet du 2026-10-03 : garder le dépôt privé et remplacer CodeQL par Semgrep.

- **CodeQL → Semgrep** : même périmètre (failles de sécurité du code), plus le Java de l'extension Keycloak. À la mise en place, Semgrep a trouvé un point réel, corrigé : le déchiffrement AES-GCM des documents fixe désormais la longueur du tag (`authTagLength`, déjà contrôlée avant).
- **Revue des dépendances → `pnpm audit`** : une dépendance npm ajoutée avec une faille connue est déjà refusée par le job « Dépendances » (haute ou critique pour ce qui est livré, critique pour les outils). Les dépendances Maven de l'extension Keycloak ne sont plus contrôlées en CI : elles restent suivies par Dependabot.

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
| 2026-10-03 | `http-cache-semantics` ≤ 4.2.0 (GHSA-ch52-4w7c-c8xp, réponse d'un autre utilisateur lue dans un cache HTTP partagé), arrivé par `unleash-client` → `make-fetch-happen` | Haute | Non exploitable ici : `unleash-client` n'active aucun cache HTTP (pas de `cachePath`) et ne sert qu'à lire l'état des flags auprès de notre Unleash, avec un jeton de service ; aucun tiers ne fait passer de requête par ce client. Aucun correctif publié | Exception décidée par le porteur de projet le 2026-10-03 ([FP-2026-001](../../control-room/fiches/FP-2026-001.md)) : faille ignorée par `pnpm audit` (`pnpm.auditConfig.ignoreGhsas` du `package.json` racine) ; test `unleash-sans-cache.test.ts` de `@mbolo/drapeaux` qui échoue si un cache est activé ; réexamen chaque semaine et dès qu'un correctif paraît (retirer alors l'exception) |
| 2026-09-27 | `vitest` et `@vitest/mocker` < 4.1.11 (GHSA-82fw-gwwq-j7x9, lecture de fichiers par traversée de chemin) | Modérée | Outil de test uniquement, jamais livré ni exposé | Passage à Vitest 4 (version majeure) à valider par le porteur de projet |

## À venir (avant la vague 1)

- Activer, dans les réglages du dépôt, les **alertes Dependabot** et les **mises à jour de sécurité Dependabot** (porteur de projet) : la PR de correctif est alors ouverte dès la publication d'une faille, sans attendre le lundi.

- Rendre obligatoires, dans la protection de `main`, les contrôles ci-dessus (décision du porteur de projet).
- Analyse des images de conteneurs (Trivy) dès que les services seront empaquetés.
- Analyse dynamique (OWASP ZAP) sur l'environnement de recette.
- Test d'intrusion externe (critère de la vague 0).
- Liste des composants (SBOM) jointe à chaque livraison.
