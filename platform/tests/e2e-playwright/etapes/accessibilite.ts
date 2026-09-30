// Accessibilité des applications (WCAG 2.1 niveau AA) : contrôle automatique par axe-core sur
// l'écran affiché. Il ne remplace pas un test avec des utilisateurs (lecteur d'écran, faible
// littératie), mais bloque les erreurs détectables : libellés, contrastes, rôles, langue.
import { AxeBuilder } from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { Then } from './fixtures.js';

const NORMES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

Then(
  'l’écran de l’{string} respecte les règles d’accessibilité',
  async ({ monde }, application: string) => {
    const page = monde.visio.get(application)?.page;
    if (!page) throw new Error(`${application} non ouverte`);
    const { violations } = await new AxeBuilder({ page }).withTags(NORMES).analyze();
    // Liste lisible dans le rapport : règle, gravité et éléments en cause.
    expect(
      violations.map(
        (v) =>
          `${v.id} (${v.impact ?? '?'}) : ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
      ),
    ).toEqual([]);
  },
);
