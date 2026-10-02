// Accessibilité des applications (WCAG 2.2 niveau AA) : contrôle automatique par axe-core sur
// l'écran affiché, puis redistribution à 320 px. Il ne remplace pas un test avec des utilisateurs
// (lecteur d'écran, faible littératie), mais bloque les erreurs détectables : libellés, contrastes,
// rôles, langue, défilement horizontal.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { Then, When } from './fixtures.js';

const NORMES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Contrôle l'écran affiché ; `ecran` nomme l'écran dans le message d'échec. Aussi appelé, de façon
 * explicite, par les étapes qui traversent les pages Keycloak de Mbolo Santé (code SMS, application
 * d'authentification, « Mon identité », numéro, code de récupération) au moment où elles s'affichent.
 */
export async function verifierAccessibilite(page: Page, ecran: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    // « target-size » (WCAG 2.2, zones à toucher d'au moins 24 px) est désactivée par défaut dans
    // axe-core : on l'active. `options` remplace le filtre de `withTags`, d'où `runOnly` ici.
    .options({
      runOnly: { type: 'tag', values: NORMES },
      rules: { 'target-size': { enabled: true } },
    })
    .analyze();
  // Liste lisible dans le rapport : règle, gravité et éléments en cause.
  expect(
    violations.map(
      (v) => `${v.id} (${v.impact ?? '?'}) : ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
    ),
    `accessibilité de l'écran « ${ecran} »`,
  ).toEqual([]);
  await verifierRedistribution(page, ecran);
}

/**
 * WCAG 1.4.10 (redistribution), qu'axe ne contrôle pas : à 320 px de large (petit téléphone, ou
 * zoom à 400 %), l'écran se lit sans défilement horizontal. La taille de la fenêtre est rendue
 * ensuite.
 */
async function verifierRedistribution(page: Page, ecran: string): Promise<void> {
  const taille = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 640 });
  try {
    const debords = await page.evaluate(() => {
      const largeur = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth <= largeur) return [];
      // Éléments visibles qui dépassent à droite, pour un message d'échec utile.
      const fautifs = Array.from(document.body.querySelectorAll('*'))
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.right > largeur + 1;
        })
        .slice(0, 5)
        .map((e) =>
          [e.tagName.toLowerCase(), e.id, e.getAttribute('class')].filter(Boolean).join(' '),
        );
      return fautifs.length > 0 ? fautifs : ['page'];
    });
    expect(debords, `défilement horizontal à 320 px sur l'écran « ${ecran} »`).toEqual([]);
  } finally {
    if (taille) await page.setViewportSize(taille);
  }
}

Then(
  'l’écran de l’{string} respecte les règles d’accessibilité',
  async ({ monde }, application: string) => {
    const page = monde.visio.get(application)?.page;
    if (!page) throw new Error(`${application} non ouverte`);
    await verifierAccessibilite(page, application);
  },
);

// Au changement d'écran, le focus va au titre du nouvel écran (WCAG 2.4.3) : un utilisateur au
// clavier ou avec un lecteur d'écran repart du nouvel écran, pas du haut de la page.
Then(
  'dans l’{string}, le focus est sur le titre {string}',
  async ({ monde }, application: string, titre: string) => {
    const page = monde.visio.get(application)?.page;
    if (!page) throw new Error(`${application} non ouverte`);
    await expect(page.locator('h2:focus')).toContainText(titre);
  },
);

// Au clavier seul (WCAG 2.1.1) : Tab jusqu'au bouton, puis Entrée. À chaque arrêt, l'élément qui a
// le focus doit être visiblement marqué (WCAG 2.4.7) : un contour que le style n'a pas retiré.
When(
  'dans l’{string}, la personne active {string} au clavier',
  async ({ monde }, application: string, nom: string) => {
    const page = monde.visio.get(application)?.page;
    if (!page) throw new Error(`${application} non ouverte`);
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const actif = await page.evaluate(() => {
        const e = document.activeElement;
        if (!(e instanceof HTMLElement) || e === document.body) return undefined;
        const style = getComputedStyle(e);
        return {
          nom: (e.getAttribute('aria-label') ?? e.textContent ?? '').replace(/\s+/g, ' ').trim(),
          visible: e.matches(':focus-visible') && style.outlineStyle !== 'none',
        };
      });
      if (!actif) continue;
      expect(actif.visible, `focus visible sur « ${actif.nom} »`).toBe(true);
      if (actif.nom.endsWith(nom)) {
        await page.keyboard.press('Enter');
        return;
      }
    }
    throw new Error(`« ${nom} » introuvable au clavier dans l’${application}`);
  },
);
