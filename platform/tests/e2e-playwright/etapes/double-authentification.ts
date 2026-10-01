// Étapes « double authentification du patient » (ADR-0022) : vrai Keycloak (flux à deux niveaux,
// extension Mbolo), service des notifications et sa boîte SMS simulée. Données FICTIVES uniquement.
import { expect, type Browser, type Page, type Request } from '@playwright/test';
import {
  APPLICATIONS,
  EMETTEUR,
  IDENTITE_URL,
  INVITATIONS_URL,
  PAIEMENT_URL,
  compte,
  motDePasse,
} from '../configuration.js';
import { Then, When, revendications, urlAutorisation, type Monde } from './fixtures.js';
import { codeSmsRecu, telephoneDu } from './niveau.js';
import { verifierAccessibilite } from './accessibilite.js';

interface Parcours {
  page: Page;
  retour: { url?: URL };
  verificateur: string;
  identifiant: string;
}
const parcours = new WeakMap<Monde, Parcours>();

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
  await verifierAccessibilite(page, 'Keycloak : code SMS');
});

/** Dernier code reçu par le patient depuis la relève de la boîte. */
const codeRecu = (monde: Monde, identifiant: string) =>
  codeSmsRecu(telephoneDu(identifiant), monde.depuis ?? '');

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

// ── Refus des actions sensibles au niveau 1 (API directes) ───────────────────

let entete: string | null = null;

async function tenter(monde: Monde, url: string, identifiant: string, corps: unknown) {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${monde.jetons.get(identifiant) ?? ''}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(corps),
  });
  monde.reponse = {
    statut: r.status,
    corps: (await r.json().catch(() => ({}))) as Record<string, unknown>,
  };
  entete = r.headers.get('www-authenticate');
}

When(
  '{string} partage son dossier avec {string} avec son seul mot de passe',
  async ({ monde }, identifiant: string, praticien: string) => {
    const patient = compte(identifiant).attributs['patient_id'] ?? '';
    await tenter(monde, `${IDENTITE_URL}/patients/${patient}/consentements`, identifiant, {
      categorie: 'C-PARTAGE-PRO',
      mode: 'texte',
      versionTexte: 'consentement-v0-FICTIF',
      accepte: true,
      beneficiaire: `Practitioner/${praticien}`,
    });
  },
);

When(
  '{string} invite un proche avec son seul mot de passe',
  async ({ monde }, identifiant: string) => {
    await tenter(monde, `${INVITATIONS_URL}/proches`, identifiant, {
      prenom: 'Paul [FICTIF]',
      lien: 'CHILD',
      telephone: '+33000000009',
      versionTexte: 'c-proche-v0.1-brouillon',
    });
  },
);

When('{string} paie avec son seul mot de passe', async ({ monde }, identifiant: string) => {
  await tenter(monde, `${PAIEMENT_URL}/paiements/${monde.paiementId ?? ''}/collecte`, identifiant, {
    operateur: 'airtel',
    numero: '+241 00 00 00 00',
  });
});

Then('la demande est refusée tant que le code SMS n’est pas saisi', ({ monde }) => {
  expect(monde.reponse?.statut).toBe(401);
  expect(monde.reponse?.corps['motif']).toBe('niveau-insuffisant');
  // En-tête de l'authentification renforcée (RFC 9470), lu par l'application.
  expect(entete).toBe('Bearer error="insufficient_user_authentication", acr_values="2"');
});
