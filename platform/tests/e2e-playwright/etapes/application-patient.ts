// Étapes « application patient » : un vrai navigateur sur l'application (vite preview), connexion
// par le formulaire Keycloak, API et LiveKit réels. Données FICTIVES uniquement.
import { expect, type Browser, type Page } from '@playwright/test';
import { creneauVideo } from '@mbolo/dossier-fhir';
import { APP_PATIENT_URL, FHIR_URL } from '../configuration.js';
import { Given, Then, When, saisirIdentifiants, type Monde } from './fixtures.js';
import { codeSmsRecu, telephoneDu } from './niveau.js';
import { boite } from './teleconsultation.js';

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

async function ouvrir(monde: Monde, browser: Browser, identifiant: string, adresse: string) {
  // Le patient autorise le micro et la caméra (comme à la demande du navigateur).
  const contexte = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const p = await contexte.newPage();
  monde.visio.set(APP, { contexte, page: p });
  monde.patientApplication = identifiant;
  await p.goto(adresse);
  await p.getByRole('button', { name: 'Se connecter' }).click();
  await saisirIdentifiants(p, identifiant, false);
  await expect(p.getByRole('heading', { name: 'Mes rendez-vous' })).toBeVisible();
}

When(
  '{string} ouvre l’application patient pour {string}',
  async (
    { monde, browser }: { monde: Monde; browser: Browser },
    identifiant: string,
    praticien: string,
  ) => {
    await ouvrir(monde, browser, identifiant, `${APP_PATIENT_URL}/?praticien=${praticien}`);
  },
);

When(
  '{string} ouvre l’application patient',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    await ouvrir(monde, browser, identifiant, `${APP_PATIENT_URL}/`);
  },
);

When('le patient choisit {string} dans l’annuaire', async ({ monde }, praticien: string) => {
  const p = page(monde);
  await p.getByRole('button', { name: 'Prendre rendez-vous' }).click();
  const fiche = p.locator(`[data-praticien="${praticien}"]`);
  // Nom et prochain créneau, sans autre information sur le professionnel.
  await expect(fiche).toContainText(`${praticien} [FICTIF]`);
  await expect(fiche).toContainText('Prochain créneau');
  await fiche.click();
});

When('le patient réserve ce créneau', async ({ monde }) => {
  const p = page(monde);
  await p.locator(`[data-creneau="${monde.creneaux?.[0] ?? ''}"]`).click();
  await p.getByRole('button', { name: 'Réserver' }).click();
});

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

Then('l’application affiche ce rendez-vous', async ({ monde }) => {
  await expect(
    page(monde).locator(`li[data-rendez-vous="${monde.rendezVousId ?? ''}"]`),
  ).toBeVisible();
});

When('le téléphone du patient perd le réseau et rouvre l’application', async ({ monde }) => {
  const p = page(monde);
  // Le service worker doit contrôler la page avant la coupure (première visite : un rechargement).
  await p.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await p.evaluate(() => navigator.serviceWorker.controller !== null))) {
    await p.reload();
    await p.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
  }
  await p.context().setOffline(true);
  await p.reload();
});

Then('l’application affiche sans réseau les rendez-vous connus', async ({ monde }) => {
  const p = page(monde);
  const vue = p.locator('[data-hors-ligne]');
  await expect(vue.getByRole('status')).toContainText('Pas de réseau.');
  await expect(vue.locator('li')).not.toHaveCount(0);
  await expect(p.getByRole('button', { name: 'Se connecter' })).toHaveCount(0);
  // Seuls l'identifiant, l'horaire et la durée sont gardés sur le téléphone.
  const garde = await p.evaluate(() => localStorage.getItem('mbolo.rendez-vous') ?? '');
  expect(garde).toContain(monde.rendezVousId ?? 'absent');
  expect(garde).not.toMatch(/prac-|pat-|praticien|patient/);
  await p.context().setOffline(false);
});

// ── Code SMS avant une action sensible (ADR-0022) ────────────────────────────

When('le patient confirme avec le code reçu par SMS', async ({ monde }) => {
  const p = page(monde);
  await expect(p.getByRole('heading', { name: 'Confirmer par SMS' })).toBeVisible();
  const depuis = new Date().toISOString();
  await p.getByRole('button', { name: 'Recevoir le code' }).click();
  // Page de Keycloak (même session) : seul le code est demandé, pas le mot de passe.
  await expect(p.locator('#code_sms')).toBeVisible();
  await expect(p.locator('#password')).toHaveCount(0);
  const telephone = telephoneDu(monde.patientApplication ?? '');
  await p.locator('#code_sms').fill(await codeSmsRecu(telephone, depuis));
  await p.locator('#kc-submit').click();
  // Retour dans l'application, sur l'écran de l'action (rouvert, sans nouvelle confirmation).
  await expect(p.locator('#code_sms')).toHaveCount(0);
  await expect(p.getByRole('heading', { name: 'Confirmer par SMS' })).toHaveCount(0);
  await expect(p.getByRole('heading', { name: 'Mbolo Santé' })).toBeVisible();
});

When('le patient renonce à recevoir le code', async ({ monde }) => {
  const p = page(monde);
  await expect(p.getByRole('heading', { name: 'Confirmer par SMS' })).toBeVisible();
  await p.getByRole('button', { name: 'Retour' }).click();
});

Then('aucun code n’est envoyé au numéro {string}', async ({ monde }, telephone: string) => {
  const recus = (await boite()).filter(
    (m) =>
      m.telephone === telephone && m.date >= (monde.depuis ?? '') && /votre code est/.test(m.texte),
  );
  expect(recus).toEqual([]);
});
