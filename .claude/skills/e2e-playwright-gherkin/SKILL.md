---
name: e2e-playwright-gherkin
description: Écrit et maintient les tests de bout en bout de Mbolo Santé en Gherkin français exécutés par Playwright (via playwright-bdd ou Cucumber), avec personas fictifs, profils réseau lents, appareils mobiles d'entrée de gamme, contrôles d'accessibilité et scénarios d'urgence, de refus et de repli audio. À utiliser pour transformer une user story en test automatisé, pour déboguer un test e2e, et pour vérifier un parcours critique avant fusion ou avant vague.
metadata:
  agent: pilote-qualite
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Tests e2e Playwright + Gherkin

## Organisation
```
platform/tests/
├── features-gherkin/<module>/<fonctionnalite>.feature   # # language: fr
└── e2e-playwright/
    ├── steps/<module>.steps.ts                           # définitions d'étapes
    ├── fixtures/personas.ts                              # personas [FICTIF]
    ├── fixtures/reseau.ts                                # profils 3G lente, coupure
    └── playwright.config.ts                              # projets : mobile-entree-de-gamme, desktop-pro
```
Outil proposé : **playwright-bdd** (génère des tests Playwright à partir des `.feature`) ; alternative : Cucumber.js + Playwright.

## Règles d'écriture
1. **Gherkin** : langage métier, `# language: fr`, un comportement observable par scénario (voir `user-stories-gherkin`).
2. **Sélecteurs** : rôles et libellés accessibles (`getByRole`, `getByLabel`) — ce qui teste aussi l'accessibilité ; `data-testid` en dernier recours.
3. **Attentes** : assertions « web-first » (`await expect(...).toBeVisible()`), **jamais** de `waitForTimeout` arbitraire.
4. **Réseau** : profils émulés (latence, débit via CDP), coupures simulées (`context.setOffline(true)`), pour vérifier le repli audio et la reprise.
5. **Appareils** : projet « mobile entrée de gamme » (petit viewport, CPU ralenti).
6. **Agents IA en e2e** : modèle simulé (réponses enregistrées) pour la stabilité ; les vrais modèles sont évalués par `evaluation-agents-ia-medicaux`.
7. **Accessibilité** : `@axe-core/playwright` sur chaque écran critique.
8. **Données** : personas et dossiers FHIR fictifs, réinitialisés à chaque exécution ; environnement de recette uniquement.
9. **Parcours critiques étiquetés** `@critique` (urgence, consentement, ordonnance, paiement, accès au dossier) : exécutés sur chaque PR.

## Exemple [FICTIF]
```gherkin
# language: fr
@critique
Fonctionnalité: Repli audio en cas de débit faible
  Scénario: La vidéo bascule en audio quand le débit chute
    Étant donné la patiente fictive "Test A" en téléconsultation vidéo avec "Dr Test B"
    Quand le débit réseau descend à 150 kbit/s
    Alors la consultation continue en audio
    Et un message indique "Connexion faible : passage en audio"
```
```ts
// steps/teleconsultation.steps.ts (extrait)
When('le débit réseau descend à {int} kbit\\/s', async ({ page }, kbps) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 300, downloadThroughput: (kbps * 1024) / 8, uploadThroughput: (kbps * 1024) / 8,
  });
});
Then('la consultation continue en audio', async ({ page }) => {
  await expect(page.getByRole('status', { name: /audio/i })).toBeVisible();
});
```

## Déroulé
1. Partir de la story Gherkin validée.
2. Écrire / réutiliser les étapes ; lancer en local (`npx playwright test`) sur la recette ou l'environnement local.
3. Stabiliser (pas de test instable accepté) ; ajouter au lot `@critique` si applicable.
4. Préparer la PR sur une branche `pilote/*` (niveau 3).

## Limites et interdits
- Ne jamais pointer un test vers la production ou utiliser des comptes réels.
- Ne jamais utiliser de pauses fixes pour « stabiliser » ; ne jamais marquer `skip` un test `@critique` en échec.
- Ne jamais inclure de secret dans le code de test (variables d'environnement de recette injectées par la CI).

## Sources
- Playwright, *Best Practices* — https://playwright.dev/docs/best-practices ; *Emulation* — https://playwright.dev/docs/emulation
- playwright-bdd — https://vitalets.github.io/playwright-bdd/
- Cucumber, Gherkin Reference — https://cucumber.io/docs/gherkin/reference/
- Deque, axe-core Playwright — https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright
