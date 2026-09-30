// Étapes « téléphone perdu » (ADR-0023, parcours 2) : action Keycloak lancée depuis l'application,
// code reçu au nouveau numéro, nouvelles photos, décision d'une personne habilitée dans l'espace
// professionnel. Données FICTIVES uniquement.
import { expect, type Browser, type Page } from '@playwright/test';
import { EXTENSION_CHANGEMENT_TELEPHONE } from '@mbolo/dossier-fhir';
import { APP_PRO_URL, FHIR_URL, IDENTITE_URL, compte } from '../configuration.js';
import { pngFictif } from './documents.js';
import { Given, Then, When, saisirIdentifiants, type Monde } from './fixtures.js';
import { codeSmsRecu } from './niveau.js';

const APP = 'application patient';
const PRO = 'espace professionnel';

const page = (monde: Monde): Page => {
  const p = monde.visio.get(APP)?.page;
  if (!p) throw new Error('L’application patient n’est pas ouverte dans ce scénario.');
  return p;
};

const pagePro = (monde: Monde): Page => {
  const p = monde.visio.get(PRO)?.page;
  if (!p) throw new Error('L’espace professionnel n’est pas ouvert dans ce scénario.');
  return p;
};

const patientId = (identifiant: string): string => {
  const id = compte(identifiant).attributs['patient_id'];
  if (!id) throw new Error(`${identifiant} n'est pas un patient.`);
  return id;
};

const jeton = (monde: Monde, identifiant: string): string => {
  const j = monde.jetons.get(identifiant);
  if (!j) throw new Error(`${identifiant} n'est pas connecté dans ce scénario.`);
  return j;
};

/** Numéro du dossier, lu directement dans le serveur FHIR (sans cache). */
async function numero(identifiant: string) {
  const r = await fetch(`${FHIR_URL}/Patient/${patientId(identifiant)}`, {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(r.status).toBe(200);
  const p = (await r.json()) as {
    telecom?: {
      value?: string;
      extension?: { url: string; valueCode?: string }[];
      period?: { start?: string };
    }[];
  };
  return p.telecom?.[0];
}

Given(
  '{string} a accepté la charte de vérification d’identité à l’inscription',
  async ({ monde }, identifiant: string) => {
    // Un patient vérifié l'a acceptée pour ses premières photos ; elle vaut pour les nouvelles.
    const r = await fetch(`${IDENTITE_URL}/patients/${patientId(identifiant)}/consentements`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jeton(monde, identifiant)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        categorie: 'C-IDENTITE',
        mode: 'texte',
        versionTexte: '0.1',
        accepte: true,
      }),
    });
    expect(r.status).toBe(201);
  },
);

When(
  'le patient choisit « J’ai perdu mon téléphone » et confirme le nouveau numéro {string}',
  async ({ monde }, nouveau: string) => {
    const p = page(monde);
    await p.getByRole('button', { name: 'Changer mon numéro' }).click();
    await p.getByRole('button', { name: 'J’ai perdu mon téléphone' }).click();
    // Keycloak : le nouveau numéro, puis le code reçu à ce numéro (jamais à l'ancien).
    await expect(p.locator('body')).toContainText("J'ai perdu mon téléphone");
    await p.locator('#telephone').fill(nouveau);
    monde.depuis = new Date().toISOString();
    await p.locator('#kc-submit').click();
    await expect(p.locator('body')).toContainText(`envoyé par SMS au ${nouveau}`);
    await p.locator('#code_sms').fill(await codeSmsRecu(nouveau, monde.depuis));
    await p.locator('#kc-submit').click();
    // Retour dans l'application : la demande est enregistrée, place aux photos.
    await expect(p.getByRole('alert')).toHaveText(
      'Demande enregistrée. Envoyez maintenant deux nouvelles photos.',
    );
    await expect(p.getByRole('heading', { name: 'Vos deux nouvelles photos' })).toBeVisible();
  },
);

When('il envoie deux nouvelles photos depuis l’application', async ({ monde }) => {
  const p = page(monde);
  await p.locator('#photo-document').setInputFiles({
    name: 'document.png',
    mimeType: 'image/png',
    buffer: pngFictif(40, 90, 160),
  });
  await p.getByRole('button', { name: 'Envoyer la photo du document' }).click();
  await expect(p.getByRole('listitem').filter({ hasText: 'Votre document' })).toContainText(
    'est envoyé',
  );
  await p.locator('#photo-visage').setInputFiles({
    name: 'visage.png',
    mimeType: 'image/png',
    buffer: pngFictif(200, 150, 120),
  });
  await p.getByRole('button', { name: 'Envoyer la photo du visage' }).click();
  await expect(p.locator('section')).toContainText(
    'va vérifier vos photos avant de changer votre numéro',
  );
});

When(
  '{string} ouvre les changements de numéro dans l’espace professionnel',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const contexte = await browser.newContext();
    const p = await contexte.newPage();
    monde.visio.set(PRO, { contexte, page: p });
    await p.goto(`${APP_PRO_URL}/`);
    await p.getByRole('button', { name: 'Se connecter' }).click();
    await saisirIdentifiants(p, identifiant, true);
    await p.getByRole('button', { name: 'Numéros perdus' }).click();
    await expect(p.getByRole('heading', { name: 'Changements de numéro' })).toBeVisible();
  },
);

When(
  'la vérificatrice ouvre la demande de {string} et voit les deux nouvelles photos',
  async ({ monde }, identifiant: string) => {
    const p = pagePro(monde);
    await p.locator(`button[data-patient="${patientId(identifiant)}"]`).click();
    await expect(p.getByRole('heading', { name: 'Identité déclarée' })).toBeVisible();
    // Les nouvelles photos sont réellement affichées (déchiffrées et décodées par le navigateur).
    const nouvelles = p
      .locator('h3', { hasText: 'Nouvelles photos' })
      .locator('xpath=following-sibling::div[1]')
      .getByRole('img', { name: /^Photo/ });
    await expect(nouvelles).toHaveCount(2);
    for (const img of await nouvelles.all()) {
      await expect
        .poll(() => img.evaluate((e) => (e as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    }
  },
);

When('la vérificatrice refuse la demande : « Le visage ne correspond pas »', async ({ monde }) => {
  const p = pagePro(monde);
  await p.getByLabel('Refuser').check();
  await p.getByLabel('Motif du refus').selectOption('visage-different');
  await p.getByRole('button', { name: 'Enregistrer la décision' }).click();
  await expect(p.getByRole('alert')).toHaveText('Demande refusée. Le numéro ne change pas.');
  await expect(p.getByText('Aucune demande en attente.')).toBeVisible();
});

When('la vérificatrice accepte le nouveau numéro', async ({ monde }) => {
  const p = pagePro(monde);
  await p.getByLabel('Accepter le nouveau numéro').check();
  monde.depuis = new Date().toISOString();
  await p.getByRole('button', { name: 'Enregistrer la décision' }).click();
  await expect(p.getByRole('alert')).toHaveText(
    'Nouveau numéro enregistré. L’ancien numéro a été prévenu.',
  );
});

Then(
  'le dossier de {string} porte encore le numéro {string}',
  // eslint-disable-next-line no-empty-pattern -- aucun élément du contexte n'est utilisé
  async ({}, identifiant: string, telephone: string) => {
    expect((await numero(identifiant))?.value).toBe(telephone);
  },
);

Then(
  'le dossier de {string} porte le numéro {string}, changé après une perte',
  // eslint-disable-next-line no-empty-pattern -- aucun élément du contexte n'est utilisé
  async ({}, identifiant: string, telephone: string) => {
    const n = await numero(identifiant);
    expect(n?.value).toBe(telephone);
    expect(n?.extension).toEqual([{ url: EXTENSION_CHANGEMENT_TELEPHONE, valueCode: 'perte' }]);
    expect(Date.now() - new Date(n?.period?.start ?? 0).getTime()).toBeLessThan(600_000);
  },
);
