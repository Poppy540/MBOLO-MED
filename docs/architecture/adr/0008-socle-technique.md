# ADR-0008 — Socle technique : monorepo TypeScript, pnpm, CI GitHub Actions

- **Date :** 2026-09-26
- **Statut :** acceptée (validée par le porteur de projet)

## Contexte
Premier code applicatif. Il faut un socle commun à tous les services et applications : langage, gestion des dépendances, qualité (format, lint, types, tests) et contrôles automatiques avant chaque fusion dans `main` (protégée).

## Options envisagées
1. **TypeScript sur Node.js 22 (LTS), monorepo pnpm** — un seul langage pour les apps et les services ; typage strict ; outillage de test mature ; pnpm rapide et économe en disque.
2. Plusieurs langages (ex. Java/Kotlin pour les services, TypeScript pour les apps) — plus de compétences à réunir, outillage dupliqué.
3. Python pour les services — bon pour la donnée, moins cohérent avec les applications web.

## Décision
Option 1.
- Arborescence : `platform/apps/*`, `platform/services/*`, `platform/packages/*` (bibliothèques partagées), déclarées dans `pnpm-workspace.yaml`.
- TypeScript **strict** (`tsconfig.base.json`), ESLint (flat config, `typescript-eslint` strict, `no-console` interdit), Prettier, Vitest.
- Premier paquet partagé : `@mbolo/journal-securise`, qui masque secrets et données de santé dans les journaux (principes n°3 et n°5). **Tout service doit journaliser via ce paquet.**
- CI GitHub Actions (`.github/workflows/ci.yml`), trois jobs obligatoires : **Sécurité** (hooks pre-commit + gitleaks sur l'historique), **Conformité des skills** (`scripts/verifier_skills.py`), **Code** (format, lint, types, tests).
- Commande locale unique : `pnpm verifier`.

## Conséquences
- Les jobs CI devront être déclarés comme **vérifications obligatoires** dans la règle de protection de `main` (action humaine dans GitHub).
- Le serveur FHIR (HAPI, Java) et Keycloak restent des composants en conteneur, hors du monorepo TypeScript : ils sont configurés, pas codés.
- Toute nouvelle dépendance passe par une demande de revue ; `pnpm audit` et trivy s'ajouteront à la CI avec les premiers services.

Sources : Node.js release schedule — https://nodejs.org/en/about/previous-releases ; pnpm workspaces — https://pnpm.io/workspaces ; typescript-eslint — https://typescript-eslint.io/ ; Vitest — https://vitest.dev/
