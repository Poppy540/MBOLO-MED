// Accessibilité des applications (WCAG 2.2 niveau AA) : contrôle automatique par axe-core sur
// l'écran affiché. Il ne remplace pas un test avec des utilisateurs (lecteur d'écran, faible
// littératie), mais bloque les erreurs détectables : libellés, contrastes, rôles, langue.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { Then } from './fixtures.js';

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
}

Then(
  'l’écran de l’{string} respecte les règles d’accessibilité',
  async ({ monde }, application: string) => {
    const page = monde.visio.get(application)?.page;
    if (!page) throw new Error(`${application} non ouverte`);
    await verifierAccessibilite(page, application);
  },
);
