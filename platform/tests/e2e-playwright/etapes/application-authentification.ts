// Étapes « application d'authentification » (ADR-0024) : vrai parcours Keycloak, code SMS de la
// boîte simulée puis code calculé comme le ferait l'application (TOTP). Données FICTIVES uniquement.
import { expect, type Browser, type Page, type Request } from '@playwright/test';
import { APPLICATIONS, EMETTEUR } from '../configuration.js';
import { Then, When, saisirIdentifiants, urlAutorisation, type Monde } from './fixtures.js';
import { codeSmsRecu, telephoneDu } from './niveau.js';
import { nouveauMotDePasse } from './recuperation.js';
import { boite } from './teleconsultation.js';
import { codeUnique, retenirSecret } from './totp.js';
import { verifierAccessibilite } from './accessibilite.js';

const CLE = 'application-authentification';

interface Parcours {
  page: Page;
  retour: { url?: URL };
  verificateur: string;
}

/** Nouveau navigateur sur Keycloak, avec le retour vers l'application relevé. */
async function ouvrir(
  monde: Monde,
  browser: Browser,
  identifiant: string,
  parametres: string,
): Promise<Parcours> {
  const contexte = await browser.newContext();
  monde.visio.set(CLE, { contexte, page: await contexte.newPage() });
  const page = (monde.visio.get(CLE) as { page: Page }).page;
  const retour: { url?: URL } = {};
  page.on('request', (r: Request) => {
    if (r.url().startsWith(APPLICATIONS.patient.redirection)) retour.url = new URL(r.url());
  });
  const { url, verificateur } = urlAutorisation('patient', true);
  monde.depuis = new Date().toISOString();
  await page.goto(`${url}${parametres}`).catch(() => undefined);
  // Le patient n'a pas de double authentification à la connexion : mot de passe seul.
  await saisirIdentifiants(page, identifiant, false);
  return { page, retour, verificateur };
}

async function saisirCodeSms(p: Parcours, identifiant: string, depuis: string): Promise<void> {
  await expect(p.page.locator('#code_sms')).toBeVisible();
  await p.page.locator('#code_sms').fill(await codeSmsRecu(telephoneDu(identifiant), depuis));
  await p.page.locator('#kc-submit').click();
}

async function activer(monde: Monde, browser: Browser, identifiant: string): Promise<Parcours> {
  const p = await ouvrir(
    monde,
    browser,
    identifiant,
    '&acr_values=2&kc_action=mbolo-activer-application',
  );
  await saisirCodeSms(p, identifiant, monde.depuis ?? '');
  // Page d'activation : QR code, clé lisible, et la clé brute dans le champ caché (comme Keycloak).
  await expect(p.page.locator('#kc-application-qr')).toBeVisible();
  await expect(p.page.locator('#kc-application-cle')).not.toBeEmpty();
  retenirSecret(identifiant, await p.page.locator('#totpSecret').inputValue());
  await p.page.locator('#code_application').fill(await codeUnique(identifiant));
  await p.page.locator('#kc-submit').click();
  await expect.poll(() => p.retour.url, { timeout: 10_000 }).toBeDefined();
  return p;
}

When(
  '{string} demande à activer une application sans avoir confirmé par SMS',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const p = await ouvrir(monde, browser, identifiant, '&kc_action=mbolo-activer-application');
    // Keycloak rend l'apostrophe droite dans ses messages.
    await expect(p.page.locator('body')).toContainText(
      "Pour activer une application, confirmez d'abord avec le code reçu par SMS",
    );
    await expect(p.page.locator('#totpSecret')).toHaveCount(0);
  },
);

When(
  '{string} active une application d’authentification après un code SMS',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const p = await activer(monde, browser, identifiant);
    expect(p.retour.url?.searchParams.get('kc_action_status')).toBe('success');
  },
);

When(
  '{string} confirme une action sensible avec le code de son application',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const p = await ouvrir(monde, browser, identifiant, '&acr_values=2');
    // Plus de code SMS : Keycloak demande celui de l'application.
    await expect(p.page.locator('#code_application')).toBeVisible();
    await expect(p.page.locator('#code_sms')).toHaveCount(0);
    await verifierAccessibilite(p.page, 'Keycloak : code de l’application');
    await p.page.locator('#code_application').fill(await codeUnique(identifiant));
    await p.page.locator('#kc-submit').click();
    await expect.poll(() => p.retour.url, { timeout: 10_000 }).toBeDefined();
    const r = await fetch(`${EMETTEUR}/protocol/openid-connect/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: APPLICATIONS.patient.clientId,
        code: p.retour.url?.searchParams.get('code') ?? '',
        redirect_uri: APPLICATIONS.patient.redirection,
        code_verifier: p.verificateur,
      }),
    });
    expect(r.status).toBe(200);
    const jeton = ((await r.json()) as { access_token: string }).access_token;
    const charge = JSON.parse(
      Buffer.from(jeton.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { acr?: string };
    expect(charge.acr).toBe('2');
  },
);

When(
  '{string} saisit un code faux à la place de celui de son application',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const p = await ouvrir(monde, browser, identifiant, '&acr_values=2');
    await p.page.locator('#code_application').fill('000000');
    await p.page.locator('#kc-submit').click();
    await expect(p.page.locator('body')).toContainText('Code incorrect');
    expect(p.retour.url).toBeUndefined();
  },
);

When(
  '{string} retire son application avec un code de l’application',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const p = await ouvrir(monde, browser, identifiant, '&kc_action=mbolo-retirer-application');
    await expect(p.page.locator('#code_application')).toBeVisible();
    await p.page.locator('#code_application').fill(await codeUnique(identifiant));
    await p.page.locator('#kc-submit').click();
    await expect.poll(() => p.retour.url, { timeout: 10_000 }).toBeDefined();
    expect(p.retour.url?.searchParams.get('kc_action_status')).toBe('success');
  },
);

Then(
  'Keycloak demande de nouveau un code par SMS à {string}',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const p = await ouvrir(monde, browser, identifiant, '&acr_values=2');
    await expect(p.page.locator('#code_sms')).toBeVisible();
    await expect(p.page.locator('#code_application')).toHaveCount(0);
  },
);

Then('aucun code SMS n’a été envoyé à {string}', async ({ monde }, identifiant: string) => {
  const depuis = monde.depuis ?? '';
  const codes = (await boite()).filter(
    (m) =>
      m.telephone === telephoneDu(identifiant) &&
      m.date >= depuis &&
      /votre code est/.test(m.texte),
  );
  expect(codes).toEqual([]);
});

When(
  '{string} ajoute un code TOTP par l’action standard de Keycloak, avec son seul mot de passe',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const contexte = await browser.newContext();
    monde.visio.set(CLE, { contexte, page: await contexte.newPage() });
    const page = (monde.visio.get(CLE) as { page: Page }).page;
    const { url } = urlAutorisation('patient', true);
    await page.goto(`${url}&kc_action=CONFIGURE_TOTP`).catch(() => undefined);
    // Page standard de Keycloak : le justificatif est créé, mais il ne désigne pas l'application.
    expect(await saisirIdentifiants(page, identifiant, true)).toBe('connecte');
  },
);

Then(
  'pendant 24 heures, Keycloak ne demande à {string} ni code SMS ni code d’application',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const contexte = await browser.newContext();
    monde.visio.set(CLE, { contexte, page: await contexte.newPage() });
    const page = (monde.visio.get(CLE) as { page: Page }).page;
    const { url } = urlAutorisation('patient', true);
    const depuis = new Date().toISOString();
    await page.goto(`${url}&acr_values=2`).catch(() => undefined);
    // Mot de passe choisi avec le code de l'équipe (l'ancien ne fonctionne plus).
    await page.locator('#username').fill(identifiant);
    await page.locator('#password').fill(nouveauMotDePasse(identifiant));
    await page.locator('#kc-login').click();
    await expect(page.locator('body')).toContainText('aucun code n');
    await expect(page.locator('body')).toContainText('24 heures');
    await expect(page.locator('#code_sms')).toHaveCount(0);
    await expect(page.locator('#code_application')).toHaveCount(0);
    const codes = (await boite()).filter(
      (m) =>
        m.telephone === telephoneDu(identifiant) &&
        m.date >= depuis &&
        /votre code est/.test(m.texte),
    );
    expect(codes).toEqual([]);
  },
);

// ── Depuis l'application patient (écran « Protéger mon compte ») ─────────────────────────────

const pageApplication = (monde: Monde): Page => {
  const p = monde.visio.get('application patient')?.page;
  if (!p) throw new Error('L’application patient n’est pas ouverte dans ce scénario.');
  return p;
};

When(
  '{string} active une application depuis « Protéger mon compte »',
  async ({ monde }, identifiant: string) => {
    const p = pageApplication(monde);
    await p.getByRole('button', { name: 'Protéger mon compte' }).click();
    await expect(p.getByRole('heading', { name: 'Protéger mon compte' })).toBeVisible();
    const depuis = new Date().toISOString();
    await p.getByRole('button', { name: 'Activer une application' }).click();
    // Keycloak, même session : seul le code SMS est demandé, puis la page d'activation.
    await expect(p.locator('#code_sms')).toBeVisible();
    await p.locator('#code_sms').fill(await codeSmsRecu(telephoneDu(identifiant), depuis));
    await p.locator('#kc-submit').click();
    await expect(p.locator('#kc-application-qr')).toBeVisible();
    retenirSecret(identifiant, await p.locator('#totpSecret').inputValue());
    await p.locator('#code_application').fill(await codeUnique(identifiant));
    await p.locator('#kc-submit').click();
  },
);

When(
  '{string} retire son application depuis « Protéger mon compte »',
  async ({ monde }, identifiant: string) => {
    const p = pageApplication(monde);
    await p.getByRole('button', { name: 'Protéger mon compte' }).click();
    await p.getByRole('button', { name: 'Retirer mon application' }).click();
    await expect(p.locator('#code_application')).toBeVisible();
    await p.locator('#code_application').fill(await codeUnique(identifiant));
    await p.locator('#kc-submit').click();
  },
);

Then('l’application patient affiche {string}', async ({ monde }, texte: string) => {
  await expect(pageApplication(monde).getByRole('alert')).toHaveText(texte);
});

When(
  '{string} confirme par SMS puis, dans la même session, active une application sans nouveau code SMS',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    // Niveau 2 obtenu par SMS dans cette session (moins de 15 minutes)…
    const p = await ouvrir(monde, browser, identifiant, '&acr_values=2');
    await saisirCodeSms(p, identifiant, monde.depuis ?? '');
    await expect.poll(() => p.retour.url, { timeout: 10_000 }).toBeDefined();
    // … puis l'activation : Keycloak ne redemande pas de code SMS, l'action reconnaît le niveau 2.
    delete p.retour.url;
    const { url } = urlAutorisation('patient', true);
    const depuis = new Date().toISOString();
    await p.page
      .goto(`${url}&acr_values=2&kc_action=mbolo-activer-application`)
      .catch(() => undefined);
    await expect(p.page.locator('#kc-application-qr')).toBeVisible();
    retenirSecret(identifiant, await p.page.locator('#totpSecret').inputValue());
    await p.page.locator('#code_application').fill(await codeUnique(identifiant));
    await p.page.locator('#kc-submit').click();
    await expect.poll(() => p.retour.url, { timeout: 10_000 }).toBeDefined();
    expect((p.retour.url as URL | undefined)?.searchParams.get('kc_action_status')).toBe('success');
    const codes = (await boite()).filter(
      (m) =>
        m.telephone === telephoneDu(identifiant) &&
        m.date >= depuis &&
        /votre code est/.test(m.texte),
    );
    expect(codes).toEqual([]);
  },
);
