// Étapes « récupération du compte d'un patient sans e-mail » (ADR-0021) : service invitations, vrai
// Keycloak (flux « identifiants oubliés » avec l'extension Mbolo), boîte SMS simulée. Données FICTIVES.
import { randomBytes } from 'node:crypto';
import { expect, type Browser, type Page, type Request } from '@playwright/test';
import { APPLICATIONS, EMETTEUR, INVITATIONS_URL, compte, motDePasse } from '../configuration.js';
import { Given, Then, When, revendications, urlAutorisation, type Monde } from './fixtures.js';

/** Code remis pendant le scénario (il n'existe que dans cette mémoire de test). */
const codes = new WeakMap<Monde, string>();
/** Nouveaux mots de passe choisis pendant l'exécution (jamais écrits sur disque). */
const nouveaux = new Map<string, string>();

async function demanderCode(monde: Monde, jeton: string, patient: string) {
  const patientId = compte(patient).attributs['patient_id'] ?? '';
  const r = await fetch(`${INVITATIONS_URL}/assistance/recuperation`, {
    method: 'POST',
    headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
    // Date de naissance et numéro d'assurance du dossier fictif (preparation-globale.ts).
    body: JSON.stringify({
      patientId,
      naissance: '1990-01-01',
      type: 'assurance-maladie',
      numero: `FICTIF-${patientId}`,
      rappel: true,
    }),
  });
  monde.reponse = {
    statut: r.status,
    corps: (await r.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

Given(
  '{string} remet par téléphone un code de récupération pour {string}',
  async ({ monde }, assistant: string, patient: string) => {
    await demanderCode(monde, monde.jetons.get(assistant) ?? '', patient);
    expect(monde.reponse?.statut).toBe(201);
    const code = monde.reponse?.corps['code'];
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    codes.set(monde, String(code));
  },
);

When(
  '{string} demande un code de récupération pour {string}',
  async ({ monde }, identifiant: string, patient: string) => {
    await demanderCode(monde, monde.jetons.get(identifiant) ?? '', patient);
  },
);

/**
 * Parcours « Mot de passe oublié ? » de l'application patient jusqu'à l'écran du code ; rend la page
 * et l'adresse de retour vers l'application, relevée si Keycloak y renvoie.
 */
async function saisirCode(browser: Browser, identifiant: string, code: string) {
  const contexte = await browser.newContext();
  const page = await contexte.newPage();
  const { redirection } = APPLICATIONS.patient;
  const { url, verificateur } = urlAutorisation('patient', true);
  const retour: { url?: URL } = {};
  page.on('request', (r: Request) => {
    if (r.url().startsWith(redirection)) retour.url = new URL(r.url());
  });
  await page.goto(url);
  await page.getByRole('link', { name: /oublié/i }).click();
  await page.locator('#username').fill(identifiant);
  await page.locator('[type=submit]').first().click();
  await page.locator('#code_recuperation').fill(code);
  await page.locator('#kc-submit').click();
  return { contexte, page, retour, verificateur };
}

const pages = new WeakMap<Monde, Page>();

When(
  '{string} choisit un nouveau mot de passe avec ce code, depuis « Mot de passe oublié ? »',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const s = await saisirCode(browser, identifiant, codes.get(monde) ?? '');
    try {
      const nouveau = `Nouveau-${randomBytes(12).toString('base64url')}`;
      await s.page.locator('#password-new').fill(nouveau);
      await s.page.locator('#password-confirm').fill(nouveau);
      await s.page.locator('[type=submit]').first().click();
      await expect.poll(() => s.retour.url, { timeout: 10_000 }).toBeDefined();
      const code = s.retour.url?.searchParams.get('code');
      expect(code, 'Keycloak doit renvoyer un code d’autorisation').toBeTruthy();
      const r = await fetch(`${EMETTEUR}/protocol/openid-connect/token`, {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: APPLICATIONS.patient.clientId,
          code: code ?? '',
          redirect_uri: APPLICATIONS.patient.redirection,
          code_verifier: s.verificateur,
        }),
      });
      expect(r.status).toBe(200);
      monde.jetons.set(identifiant, ((await r.json()) as { access_token: string }).access_token);
      nouveaux.set(identifiant, nouveau);
    } finally {
      await s.contexte.close();
    }
  },
);

When(
  '{string} saisit de nouveau ce code dans « Mot de passe oublié ? »',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const s = await saisirCode(browser, identifiant, codes.get(monde) ?? '');
    monde.visio.set(`recuperation-${identifiant}`, { contexte: s.contexte, page: s.page });
    pages.set(monde, s.page);
  },
);

Then('Keycloak indique {string}', async ({ monde }, texte: string) => {
  const page = pages.get(monde);
  if (!page) throw new Error('Aucune page Keycloak ouverte dans ce scénario.');
  await expect(page.locator('body')).toContainText(texte);
  // Toujours sur l'écran du code : pas de choix de mot de passe.
  await expect(page.locator('#password-new')).toHaveCount(0);
});

Then(
  '{string} est connecté avec son nouveau mot de passe',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    // Jeton du compte récupéré, rattaché au bon dossier.
    const charge = revendications(monde.jetons.get(identifiant) ?? '');
    expect(charge['patient_id']).toBe(compte(identifiant).attributs['patient_id']);
    expect(await essayer(browser, identifiant, nouveaux.get(identifiant) ?? '')).toBe(true);
  },
);

Then(
  'l’ancien mot de passe de {string} ne fonctionne plus',
  async ({ browser }: { browser: Browser }, identifiant: string) => {
    expect(await essayer(browser, identifiant, motDePasse(identifiant))).toBe(false);
  },
);

/** Connexion par la page Keycloak avec ce mot de passe : vrai si Keycloak renvoie un code. */
async function essayer(browser: Browser, identifiant: string, mdp: string): Promise<boolean> {
  const contexte = await browser.newContext();
  try {
    const page = await contexte.newPage();
    let code = false;
    page.on('request', (r) => {
      if (r.url().startsWith(APPLICATIONS.patient.redirection) && r.url().includes('code=')) {
        code = true;
      }
    });
    await page.goto(urlAutorisation('patient', true).url);
    await page.locator('#username').fill(identifiant);
    await page.locator('#password').fill(mdp);
    await page.locator('#kc-login').click();
    // Soit Keycloak renvoie vers l'application avec un code, soit il affiche son erreur.
    const erreur = page.getByText(/invalide/i);
    await expect
      .poll(async () => code || (await erreur.count()) > 0, { timeout: 10_000 })
      .toBe(true);
    return code;
  } finally {
    await contexte.close();
  }
}
