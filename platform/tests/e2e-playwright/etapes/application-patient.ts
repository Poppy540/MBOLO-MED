// Étapes « application patient » : un vrai navigateur sur l'application (vite preview), connexion
// par le formulaire Keycloak, API et LiveKit réels. Données FICTIVES uniquement.
import { expect, type Browser, type Page } from '@playwright/test';
import { creneauVideo } from '@mbolo/dossier-fhir';
import { APP_PATIENT_URL, FHIR_URL } from '../configuration.js';
import { Given, Then, When, saisirIdentifiants, type Monde } from './fixtures.js';

const APP = 'application patient';

const page = (monde: Monde): Page => {
  const p = monde.visio.get(APP)?.page;
  if (!p) throw new Error('L’application patient n’est pas ouverte dans ce scénario.');
  return p;
};

Given(
  'un créneau libre de {string} est publié dans {int} jours',
  async ({ monde }, praticien: string, jours: number) => {
    const debut = new Date(Date.now() + jours * 24 * 3_600_000);
    debut.setUTCSeconds(0, 0);
    const r = await fetch(`${FHIR_URL}/Slot`, {
      method: 'POST',
      headers: { 'content-type': 'application/fhir+json', prefer: 'return=representation' },
      body: JSON.stringify(
        creneauVideo({
          agendaId: `agenda-${praticien}`,
          debut: debut.toISOString(),
          dureeMinutes: 20,
          env: 'dev',
        }),
      ),
    });
    expect(r.status).toBe(201);
    monde.creneaux = [((await r.json()) as { id: string }).id];
  },
);

When(
  '{string} ouvre l’application patient pour {string}',
  async (
    { monde, browser }: { monde: Monde; browser: Browser },
    identifiant: string,
    praticien: string,
  ) => {
    // Le patient autorise le micro et la caméra (comme à la demande du navigateur).
    const contexte = await browser.newContext({ permissions: ['microphone', 'camera'] });
    const p = await contexte.newPage();
    monde.visio.set(APP, { contexte, page: p });
    await p.goto(`${APP_PATIENT_URL}/?praticien=${praticien}`);
    await p.getByRole('button', { name: 'Se connecter' }).click();
    await saisirIdentifiants(p, identifiant, false);
    await expect(p.getByRole('heading', { name: 'Mes rendez-vous' })).toBeVisible();
  },
);

When('le patient réserve ce créneau dans l’application', async ({ monde }) => {
  const p = page(monde);
  await p.getByRole('button', { name: 'Prendre rendez-vous' }).click();
  await p.locator(`[data-creneau="${monde.creneaux?.[0] ?? ''}"]`).click();
  await p.getByRole('button', { name: 'Réserver' }).click();
});

Then('l’application confirme le rendez-vous', async ({ monde }) => {
  const p = page(monde);
  await expect(p.getByRole('alert')).toHaveText('Rendez-vous réservé.');
  await expect(p.locator(`li[data-creneau="${monde.creneaux?.[0] ?? ''}"]`)).toBeVisible();
});

When('le patient annule ce rendez-vous dans l’application', async ({ monde }) => {
  const p = page(monde);
  await p
    .locator(`li[data-creneau="${monde.creneaux?.[0] ?? ''}"]`)
    .getByRole('button', { name: 'Annuler' })
    .click();
});

Then('le rendez-vous disparaît de l’application', async ({ monde }) => {
  await expect(page(monde).locator(`li[data-creneau="${monde.creneaux?.[0] ?? ''}"]`)).toHaveCount(
    0,
  );
});

When('le patient rejoint ce rendez-vous dans l’application', async ({ monde }) => {
  const p = page(monde);
  await p
    .locator(`li[data-rendez-vous="${monde.rendezVousId ?? ''}"]`)
    .getByRole('button', { name: 'Rejoindre' })
    .click();
});

Then('l’application indique que le professionnel de santé est connecté', async ({ monde }) => {
  await expect(page(monde).locator('[data-etat-visio]')).toHaveText(
    'Professionnel de santé connecté.',
    { timeout: 20_000 },
  );
  // La vidéo du professionnel est affichée.
  await expect(page(monde).locator('[data-piste="video"]')).toHaveCount(1, { timeout: 20_000 });
});

When('le patient passe en audio seulement', async ({ monde }) => {
  await page(monde)
    .getByRole('button', { name: /Audio seulement/ })
    .click();
});

Then('l’application ne reçoit plus que le son', async ({ monde }) => {
  const p = page(monde);
  await expect(p.locator('[data-audio-seulement]')).toHaveText('Audio seulement.');
  await expect(p.locator('[data-piste="video"]')).toHaveCount(0, { timeout: 10_000 });
  await expect(p.locator('[data-piste="audio"]')).toHaveCount(1);
});
