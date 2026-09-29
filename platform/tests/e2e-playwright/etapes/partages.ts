// Étapes « Mes partages et accès » : le patient partage son dossier depuis l'application (consentement
// C-PARTAGE-PRO), le retire, et voit l'historique des accès. Données FICTIVES uniquement.
import { expect, type Page } from '@playwright/test';
import { FHIR_URL } from '../configuration.js';
import { Then, When, type Monde } from './fixtures.js';

const page = (monde: Monde): Page => {
  const p = monde.visio.get('application patient')?.page;
  if (!p) throw new Error('L’application patient n’est pas ouverte dans ce scénario.');
  return p;
};

/** Consentements actifs de partage avec ce bénéficiaire, lus directement dans le dossier de test. */
async function partagesActifs(beneficiaire: string): Promise<number> {
  const r = await fetch(
    `${FHIR_URL}/Consent?patient=Patient/pat-fictif-001&status=active&_count=200`,
    {
      headers: { 'cache-control': 'no-cache' },
    },
  );
  expect(r.status).toBe(200);
  const b = (await r.json()) as {
    entry?: {
      resource: {
        category?: { coding?: { code?: string }[] }[];
        provision?: { type?: string; actor?: { reference?: { reference?: string } }[] };
      };
    }[];
  };
  return (b.entry ?? []).filter(
    ({ resource: c }) =>
      c.category?.[0]?.coding?.[0]?.code === 'C-PARTAGE-PRO' &&
      c.provision?.type === 'permit' &&
      c.provision.actor?.[0]?.reference?.reference === beneficiaire,
  ).length;
}

When('le patient ouvre ses partages et accès', async ({ monde }) => {
  const p = page(monde);
  const titre = p.getByRole('heading', { name: 'Mes partages et accès' });
  if (await titre.isVisible()) await p.getByRole('button', { name: 'Retour' }).click();
  await p.getByRole('button', { name: 'Mes partages et accès' }).click();
  await expect(titre).toBeVisible();
  await expect(p.getByRole('heading', { name: 'Qui peut lire mon dossier' })).toBeVisible();
});

When(
  'le patient demande à partager son dossier avec {string}',
  async ({ monde }, praticien: string) => {
    // Sans code SMS récent (niveau 2, ADR-0022), l'application le demande avant le texte de partage.
    await page(monde).locator(`[data-partager="${praticien}"]`).click();
  },
);

When(
  'le patient lit le texte de partage puis partage son dossier avec {string}',
  async ({ monde }, praticien: string) => {
    const p = page(monde);
    await p.locator(`[data-partager="${praticien}"]`).click();
    // Le texte nomme le médecin et rappelle que l'accord se retire à tout moment.
    await expect(p.getByText(`${praticien} [FICTIF]`)).toBeVisible();
    await expect(p.getByText('Je peux retirer cet accord à tout moment')).toBeVisible();
    await p.getByRole('button', { name: 'J’accepte' }).click();
    await expect(p.getByRole('status')).toHaveText(
      `Votre dossier est partagé avec ${praticien} [FICTIF].`,
    );
    await expect(p.locator(`[data-partage="Practitioner/${praticien}"]`)).toBeVisible();
  },
);

When(
  'le patient lit le texte de partage avec {string} puis répond « Non, pas maintenant »',
  async ({ monde }, praticien: string) => {
    const p = page(monde);
    await p.locator(`[data-partager="${praticien}"]`).click();
    await p.getByRole('button', { name: 'Non, pas maintenant' }).click();
    await expect(p.locator(`[data-partager="${praticien}"]`)).toBeVisible();
  },
);

When(
  'le patient retire le partage avec {string} dans l’application',
  async ({ monde }, praticien: string) => {
    const p = page(monde);
    await p
      .locator(`[data-partage="Practitioner/${praticien}"]`)
      .getByRole('button', { name: 'Retirer ce partage' })
      .click();
    await expect(p.getByRole('status')).toHaveText('Partage retiré.');
    await expect(p.locator(`[data-partage="Practitioner/${praticien}"]`)).toHaveCount(0);
  },
);

Then(
  'le dossier médical contient un partage actif avec {string}',
  // eslint-disable-next-line no-empty-pattern -- aucun élément du contexte n'est utilisé
  async ({}, beneficiaire: string) => {
    expect(await partagesActifs(beneficiaire)).toBe(1);
  },
);

Then(
  'le dossier médical ne contient aucun partage actif avec {string}',
  // eslint-disable-next-line no-empty-pattern -- aucun élément du contexte n'est utilisé
  async ({}, beneficiaire: string) => {
    expect(await partagesActifs(beneficiaire)).toBe(0);
  },
);

Then(
  'l’application montre qu’un professionnel de santé a lu le dossier, puis s’est vu refuser l’accès',
  async ({ monde }) => {
    const p = page(monde);
    await expect(
      p.locator('li[data-acces="accorde"]', { hasText: 'Un professionnel de santé' }).first(),
    ).toBeVisible();
    // Le plus récent en premier : le refus qui suit le retrait du partage.
    await expect(p.locator('li[data-acces]').first()).toHaveAttribute('data-acces', 'refuse');
    await expect(p.locator('li[data-acces]').first()).toContainText('Un professionnel de santé');
  },
);
