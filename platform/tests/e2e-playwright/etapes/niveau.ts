// Jeton de niveau 2 (ADR-0022) pour les étapes qui appellent directement une action sensible
// (payer, partager son dossier, inviter un proche) : vrai parcours Keycloak, mot de passe puis code
// reçu dans la boîte SMS simulée. Données FICTIVES uniquement.
import { expect, type Browser, type Page, type Request } from '@playwright/test';
import { APPLICATIONS, EMETTEUR, compte } from '../configuration.js';
import { saisirIdentifiants, urlAutorisation, type Monde } from './fixtures.js';
import { boite } from './teleconsultation.js';

/** Numéro du dossier de chaque patient fictif (le même que dans la préparation des e2e). */
export const telephoneDu = (identifiant: string): string =>
  ({ 'pat-fictif-004': '+241 00 00 00 04', 'pat-fictif-005': '+241 00 00 00 05' })[
    compte(identifiant).attributs['patient_id'] ?? ''
  ] ?? '+241 00 00 00 01';

/** Dernier code de connexion reçu à ce numéro depuis `depuis`. */
export async function codeSmsRecu(telephone: string, depuis: string): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        code = (await boite())
          .filter((m) => m.telephone === telephone && m.date >= depuis)
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

/** Retour de Keycloak vers l'application, relevé sur les requêtes du navigateur. */
function suivreRetour(page: Page): { url?: URL } {
  const retour: { url?: URL } = {};
  page.on('request', (r: Request) => {
    if (r.url().startsWith(APPLICATIONS.patient.redirection)) retour.url = new URL(r.url());
  });
  return retour;
}

// Le niveau 2 dure 15 minutes et le jeton 5 : on le réutilise 4 minutes.
const cache = new Map<string, { jeton: string; obtenuA: number }>();

/**
 * Jeton pour une action sensible : celui du scénario pour un compte non patient (le service le
 * refusera pour son rôle), aucun si le compte n'est pas connecté dans le scénario, sinon un jeton de
 * niveau 2 obtenu avec le code SMS.
 */
export async function jetonActionSensible(
  monde: Monde,
  browser: Browser,
  identifiant: string | undefined,
): Promise<string | undefined> {
  if (!identifiant) return undefined;
  const jeton = monde.jetons.get(identifiant);
  if (!jeton || !compte(identifiant).attributs['patient_id']) return jeton;
  const deja = cache.get(identifiant);
  if (deja && Date.now() - deja.obtenuA < 240_000) return deja.jeton;

  const contexte = await browser.newContext();
  try {
    const page = await contexte.newPage();
    const retour = suivreRetour(page);
    // Niveau 1 : mot de passe seul.
    await page.goto(urlAutorisation('patient', true).url);
    await saisirIdentifiants(page, identifiant, true);
    await expect.poll(() => retour.url, { timeout: 10_000 }).toBeDefined();
    // Niveau 2 : même session Keycloak, code SMS.
    delete retour.url;
    const depuis = new Date().toISOString();
    const { url, verificateur } = urlAutorisation('patient', true);
    await page.goto(`${url}&acr_values=2`).catch(() => undefined);
    await expect(page.locator('#code_sms')).toBeVisible();
    await page.locator('#code_sms').fill(await codeSmsRecu(telephoneDu(identifiant), depuis));
    await page.locator('#kc-submit').click();
    await expect.poll(() => retour.url, { timeout: 10_000 }).toBeDefined();
    const code = (retour.url as URL | undefined)?.searchParams.get('code') ?? '';
    const r = await fetch(`${EMETTEUR}/protocol/openid-connect/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: APPLICATIONS.patient.clientId,
        code,
        redirect_uri: APPLICATIONS.patient.redirection,
        code_verifier: verificateur,
      }),
    });
    expect(r.status).toBe(200);
    const niveau2 = ((await r.json()) as { access_token: string }).access_token;
    cache.set(identifiant, { jeton: niveau2, obtenuA: Date.now() });
    return niveau2;
  } finally {
    await contexte.close();
  }
}
