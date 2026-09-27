// Étapes « espace professionnel » : vrai navigateur sur l'application (vite preview), connexion
// par le formulaire Keycloak avec double authentification, API et LiveKit réels. Données FICTIVES.
import { expect, type Browser, type Page } from '@playwright/test';
import { APP_PRO_URL, FHIR_URL } from '../configuration.js';
import { Then, When, saisirIdentifiants, type Monde } from './fixtures.js';

const PRO = 'espace professionnel';
const FUSEAU = 'Africa/Libreville';

const page = (monde: Monde): Page => {
  const p = monde.visio.get(PRO)?.page;
  if (!p) throw new Error('L’espace professionnel n’est pas ouvert dans ce scénario.');
  return p;
};

/** Jour J+n au fuseau du pays déployé, au format des champs de saisie (AAAA-MM-JJ) et JJ/MM. */
function jour(n: number): { saisie: string; affichage: string } {
  const parties = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.now() + n * 24 * 3_600_000));
  const v = (t: string) => parties.find((p) => p.type === t)?.value ?? '';
  return {
    saisie: `${v('year')}-${v('month')}-${v('day')}`,
    affichage: `${v('day')}/${v('month')}`,
  };
}

When(
  '{string} ouvre l’espace professionnel',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const contexte = await browser.newContext({ permissions: ['microphone', 'camera'] });
    const p = await contexte.newPage();
    monde.visio.set(PRO, { contexte, page: p });
    await p.goto(APP_PRO_URL);
    await p.getByRole('button', { name: 'Se connecter' }).click();
    await saisirIdentifiants(p, identifiant, true);
    await expect(p.getByRole('heading', { name: 'Rendez-vous à venir' })).toBeVisible();
  },
);

When(
  'le professionnel publie {int} créneaux de {int} minutes dans {int} jours à {string}',
  async ({ monde }, nombre: number, duree: number, jours: number, heure: string) => {
    const p = page(monde);
    await p.getByRole('button', { name: /Mes créneaux/ }).click();
    await p.getByLabel('Date').fill(jour(jours).saisie);
    await p.getByLabel('Heure de début').fill(heure);
    await p.getByLabel('Durée').selectOption(String(duree));
    await p.getByLabel('Nombre de créneaux').fill(String(nombre));
    await p.getByRole('button', { name: /Publier/ }).click();
    await expect(p.getByRole('status')).toHaveText(`${nombre} créneau(x) publié(s).`);
  },
);

Then(
  'l’espace professionnel affiche un créneau libre dans {int} jours à {string}',
  async ({ monde }, jours: number, heure: string) => {
    const li = page(monde).locator('li[data-statut="libre"]', {
      hasText: `${jour(jours).affichage} à ${heure}`,
    });
    await expect(li).toHaveCount(1);
  },
);

When(
  'le professionnel retire le créneau libre dans {int} jours à {string}',
  async ({ monde }, jours: number, heure: string) => {
    await page(monde)
      .locator('li[data-statut="libre"]', { hasText: `${jour(jours).affichage} à ${heure}` })
      .getByRole('button', { name: 'Retirer' })
      .click();
  },
);

Then(
  'l’espace professionnel n’affiche plus de créneau dans {int} jours à {string}',
  async ({ monde }, jours: number, heure: string) => {
    await expect(
      page(monde).locator('li[data-creneau]', { hasText: `${jour(jours).affichage} à ${heure}` }),
    ).toHaveCount(0);
  },
);

When(
  'le professionnel reporte ce rendez-vous au créneau dans {int} jours à {string}',
  async ({ monde }, jours: number, heure: string) => {
    const p = page(monde);
    await p
      .getByRole('button', { name: /Rendez-vous/ })
      .first()
      .click();
    await p
      .locator(`li[data-rendez-vous="${monde.rendezVousId ?? ''}"]`)
      .getByRole('button', { name: 'Reporter' })
      .click();
    await p
      .getByRole('button', { name: new RegExp(`${jour(jours).affichage} à ${heure}`) })
      .click();
    await expect(p.getByRole('alert')).toHaveText('Rendez-vous reporté. Le patient est prévenu.');
  },
);

Then(
  'le dossier médical place ce rendez-vous dans {int} jours à {string}, heure du Gabon',
  async ({ monde }, jours: number, heure: string) => {
    const r = await fetch(`${FHIR_URL}/Appointment/${monde.rendezVousId ?? ''}`, {
      headers: { accept: 'application/fhir+json', 'cache-control': 'no-cache' },
    });
    const a = (await r.json()) as { start: string };
    const affiche = new Intl.DateTimeFormat('fr-FR', {
      timeZone: FUSEAU,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(a.start));
    expect(affiche).toBe(`${jour(jours).affichage} ${heure}`);
  },
);

When('le professionnel rejoint ce rendez-vous dans l’espace professionnel', async ({ monde }) => {
  await page(monde)
    .locator(`li[data-rendez-vous="${monde.rendezVousId ?? ''}"]`)
    .getByRole('button', { name: 'Rejoindre' })
    .click();
});

Then('l’espace professionnel indique que le patient est connecté', async ({ monde }) => {
  await expect(page(monde).locator('[data-etat-visio]')).toHaveText('Patient connecté.', {
    timeout: 20_000,
  });
  await expect(page(monde).locator('[data-piste="video"]')).toHaveCount(1, { timeout: 20_000 });
});
