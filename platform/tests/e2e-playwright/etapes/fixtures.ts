// Contexte partagé des scénarios : jetons obtenus par une vraie connexion Keycloak (PKCE S256).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, type BrowserContext, type Page, type Request } from '@playwright/test';
import { test as base, createBdd } from 'playwright-bdd';
import { APPLICATIONS, EMETTEUR, compte, motDePasse } from '../configuration.js';
import { codeUnique, retenirSecret } from './totp.js';

export interface Reponse {
  statut: number;
  corps: Record<string, unknown>;
}

export interface Monde {
  jetons: Map<string, string>;
  reponse?: Reponse;
  consentementId?: string;
  traceId?: string;
  rendezVousId?: string;
  /** Créneaux publiés ou préparés pendant le scénario (identifiants). */
  creneaux?: string[];
  /** Créneau du rendez-vous avant un report. */
  creneauInitial?: string;
  /** Début de la relève de la boîte des notifications simulées. */
  depuis?: string;
  /** Conclusion du compte-rendu rédigé pendant le scénario (unique par exécution). */
  conclusion?: string;
  /** Invitation créée pendant le scénario (le code n'existe que dans cette mémoire de test). */
  invitation?: { id: string; code: string };
  /** Inscription pendant le scénario : identifiant fictif et jeton obtenu, ou page d'erreur. */
  inscription?: { identifiant: string; jeton?: string; page?: Page };
  /** Navigateurs ouverts pour la visioconsultation, par compte (fermés en fin de scénario). */
  visio: Map<string, { contexte: BrowserContext; page: Page }>;
}

const base64url = (b: Buffer): string => b.toString('base64url');

/**
 * Page de connexion Keycloak : identifiant et mot de passe, puis, pour les rôles à MFA obligatoire,
 * configuration de l'OTP (première connexion) ou saisie du code. Avec `mfa: false`, on s'arrête
 * avant l'étape OTP pour vérifier qu'elle est bien exigée.
 */
export async function saisirIdentifiants(
  page: Page,
  identifiant: string,
  mfa: boolean,
): Promise<'connecte' | 'otp-exige'> {
  await page.locator('#username').fill(identifiant);
  await page.locator('#password').fill(motDePasse(identifiant));
  await page.locator('#kc-login').click();
  await page.waitForLoadState();
  const configuration = page.locator('#totpSecret');
  const saisie = page.locator('#otp');
  if (!(await configuration.count()) && !(await saisie.count())) return 'connecte';
  if (!mfa) return 'otp-exige';
  if (await configuration.count()) {
    retenirSecret(identifiant, await configuration.inputValue());
    await page.locator('#totp').fill(await codeUnique(identifiant));
    await page.locator('#userLabel').fill('Téléphone de test [FICTIF]');
    await page.locator('#saveTOTPBtn').click();
  } else {
    await saisie.fill(await codeUnique(identifiant));
    await page.locator('#kc-login').click();
  }
  return 'connecte';
}

/** Adresse de la page de connexion Keycloak pour une application, avec ou sans défi PKCE. */
export function urlAutorisation(
  application: keyof typeof APPLICATIONS,
  pkce: boolean,
): { url: string; verificateur: string } {
  const { clientId, redirection } = APPLICATIONS[application];
  const verificateur = base64url(randomBytes(32));
  const parametres = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'openid',
    redirect_uri: redirection,
    state: randomUUID(),
  });
  if (pkce) {
    parametres.set('code_challenge', base64url(createHash('sha256').update(verificateur).digest()));
    parametres.set('code_challenge_method', 'S256');
  }
  return { url: `${EMETTEUR}/protocol/openid-connect/auth?${parametres.toString()}`, verificateur };
}

/** Résultat du retour de Keycloak vers l'application (code ou erreur). */
export async function autoriser(
  page: Page,
  application: keyof typeof APPLICATIONS,
  options: { pkce: boolean; identifiant?: string },
): Promise<{ code?: string; erreur?: string; verificateur: string }> {
  const { redirection } = APPLICATIONS[application];
  const { url, verificateur } = urlAutorisation(application, options.pkce);
  // L'application n'existe pas encore : on relève l'adresse de retour demandée par Keycloak
  // (la navigation vers cette adresse échoue ensuite, sans conséquence).
  let retour: URL | undefined;
  const surRequete = (r: Request): void => {
    if (r.url().startsWith(redirection)) retour = new URL(r.url());
  };
  page.on('request', surRequete);
  await page.goto(url).catch(() => undefined);
  if (options.identifiant && !retour) {
    await saisirIdentifiants(page, options.identifiant, true);
  }
  await expect.poll(() => retour, { timeout: 10_000 }).toBeDefined();
  page.off('request', surRequete);
  const code = retour?.searchParams.get('code') ?? undefined;
  const erreur = retour?.searchParams.get('error') ?? undefined;
  return { ...(code ? { code } : {}), ...(erreur ? { erreur } : {}), verificateur };
}

/** Connexion complète : page de connexion Keycloak, puis échange du code avec le vérificateur PKCE. */
export async function connecter(page: Page, identifiant: string): Promise<string> {
  const application = compte(identifiant).application;
  const { code, verificateur } = await autoriser(page, application, {
    pkce: true,
    identifiant,
  });
  expect(code, 'Keycloak doit renvoyer un code d’autorisation').toBeTruthy();
  const { clientId, redirection } = APPLICATIONS[application];
  const r = await fetch(`${EMETTEUR}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: code ?? '',
      redirect_uri: redirection,
      code_verifier: verificateur,
    }),
  });
  expect(r.status).toBe(200);
  await page.context().clearCookies();
  return ((await r.json()) as { access_token: string }).access_token;
}

export function revendications(jeton: string): Record<string, unknown> {
  const partie = jeton.split('.')[1] ?? '';
  return JSON.parse(Buffer.from(partie, 'base64url').toString('utf8')) as Record<string, unknown>;
}

export const test = base.extend<{ monde: Monde }>({
  // eslint-disable-next-line no-empty-pattern
  monde: async ({}, use) => {
    const monde: Monde = { jetons: new Map(), visio: new Map() };
    await use(monde);
    for (const { contexte } of monde.visio.values()) await contexte.close();
  },
});

export const { Given, When, Then } = createBdd(test);
