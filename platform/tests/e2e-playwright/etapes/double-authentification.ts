// Étapes « double authentification du patient » (ADR-0022) : vrai Keycloak (flux à deux niveaux,
// extension Mbolo), service des notifications et sa boîte SMS simulée. Données FICTIVES uniquement.
import { expect, type Browser, type Page, type Request } from '@playwright/test';
import { APPLICATIONS, EMETTEUR, compte, motDePasse } from '../configuration.js';
import { Then, When, revendications, urlAutorisation, type Monde } from './fixtures.js';
import { boite } from './teleconsultation.js';

interface Parcours {
  page: Page;
  retour: { url?: URL };
  verificateur: string;
  identifiant: string;
}
const parcours = new WeakMap<Monde, Parcours>();

const telephoneDu = (identifiant: string) =>
  ({ 'pat-fictif-004': '+241 00 00 00 04', 'pat-fictif-005': '+241 00 00 00 05' })[
    compte(identifiant).attributs['patient_id'] ?? ''
  ] ?? '+241 00 00 00 01';

When(
  '{string} se connecte, puis l’application demande une confirmation par SMS',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const contexte = await browser.newContext();
    const page = await contexte.newPage();
    monde.visio.set(`niveau-2-${identifiant}`, { contexte, page });
    const retour: { url?: URL } = {};
    page.on('request', (r: Request) => {
      if (r.url().startsWith(APPLICATIONS.patient.redirection)) retour.url = new URL(r.url());
    });
    // Niveau 1 : mot de passe seul.
    await page.goto(urlAutorisation('patient', true).url);
    await page.locator('#username').fill(identifiant);
    await page.locator('#password').fill(motDePasse(identifiant));
    await page.locator('#kc-login').click();
    await expect.poll(() => retour.url, { timeout: 10_000 }).toBeDefined();
    // Niveau 2 demandé par l'application avant une action sensible : même session Keycloak.
    delete retour.url;
    const { url, verificateur } = urlAutorisation('patient', true);
    // Si Keycloak renvoyait directement vers l'application, la navigation vers celle-ci échoue.
    await page.goto(`${url}&acr_values=2`).catch(() => undefined);
    // Relu après la navigation (le rappel de `request` l'a peut-être rempli).
    const direct: URL | undefined = retour.url as URL | undefined;
    if (direct) throw new Error(`Retour direct, sans code SMS : ${direct.search}`);
    parcours.set(monde, { page, retour, verificateur, identifiant });
  },
);

const courant = (monde: Monde): Parcours => {
  const p = parcours.get(monde);
  if (!p) throw new Error('Aucune demande de confirmation par SMS dans ce scénario.');
  return p;
};

Then('Keycloak demande le code reçu par SMS', async ({ monde }) => {
  const { page } = courant(monde);
  await expect(page.locator('#code_sms')).toBeVisible();
  await expect(page.locator('body')).toContainText("Un code vient d'être envoyé par SMS");
});

/** Dernier code reçu par le patient depuis la relève de la boîte. */
async function codeRecu(monde: Monde, identifiant: string): Promise<string> {
  const telephone = telephoneDu(identifiant);
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const recus = (await boite()).filter(
          (m) => m.telephone === telephone && m.date >= (monde.depuis ?? ''),
        );
        code = recus
          .map((m) => /votre code est ([0-9]{6})/.exec(m.texte)?.[1])
          .filter(Boolean)
          .at(-1);
        return code;
      },
      { timeout: 5_000 },
    )
    .toBeDefined();
  return code ?? '';
}

When('le patient saisit le code reçu', async ({ monde }) => {
  const p = courant(monde);
  await p.page.locator('#code_sms').fill(await codeRecu(monde, p.identifiant));
  await p.page.locator('#kc-submit').click();
});

When('le patient saisit trois fois un code faux', async ({ monde }) => {
  const p = courant(monde);
  const bon = await codeRecu(monde, p.identifiant);
  const faux = bon === '000000' ? '000001' : '000000';
  for (let i = 0; i < 3; i++) {
    await p.page.locator('#code_sms').fill(faux);
    await p.page.locator('#kc-submit').click();
    await p.page.waitForLoadState();
  }
});

Then('la page du code affiche {string}', async ({ monde }, texte: string) => {
  const { page } = courant(monde);
  await expect(page.locator('body')).toContainText(texte);
});

Then(
  'le jeton de {string} est de niveau {int}',
  async ({ monde }, identifiant: string, niveau: number) => {
    let jeton = monde.jetons.get(identifiant);
    const p = parcours.get(monde);
    if (p && p.identifiant === identifiant) {
      // Retour vers l'application après le code : échange avec le vérificateur PKCE du niveau 2.
      await expect.poll(() => p.retour.url, { timeout: 10_000 }).toBeDefined();
      const code = p.retour.url?.searchParams.get('code');
      expect(code, 'Keycloak doit renvoyer un code d’autorisation').toBeTruthy();
      const r = await fetch(`${EMETTEUR}/protocol/openid-connect/token`, {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: APPLICATIONS.patient.clientId,
          code: code ?? '',
          redirect_uri: APPLICATIONS.patient.redirection,
          code_verifier: p.verificateur,
        }),
      });
      expect(r.status).toBe(200);
      jeton = ((await r.json()) as { access_token: string }).access_token;
    }
    expect(revendications(jeton ?? '')['acr']).toBe(String(niveau));
  },
);
