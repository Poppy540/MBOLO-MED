// Contexte partagé des scénarios : jetons obtenus par une vraie connexion Keycloak (PKCE S256).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, type Page, type Request } from '@playwright/test';
import { test as base, createBdd } from 'playwright-bdd';
import { APPLICATIONS, EMETTEUR, compte, motDePasse } from '../configuration.js';

export interface Reponse {
  statut: number;
  corps: Record<string, unknown>;
}

export interface Monde {
  jetons: Map<string, string>;
  reponse?: Reponse;
  consentementId?: string;
}

const base64url = (b: Buffer): string => b.toString('base64url');

/** Résultat du retour de Keycloak vers l'application (code ou erreur). */
export async function autoriser(
  page: Page,
  application: keyof typeof APPLICATIONS,
  options: { pkce: boolean; identifiant?: string },
): Promise<{ code?: string; erreur?: string; verificateur: string }> {
  const { clientId, redirection } = APPLICATIONS[application];
  const verificateur = base64url(randomBytes(32));
  const parametres = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'openid',
    redirect_uri: redirection,
    state: randomUUID(),
  });
  if (options.pkce) {
    parametres.set('code_challenge', base64url(createHash('sha256').update(verificateur).digest()));
    parametres.set('code_challenge_method', 'S256');
  }
  // L'application n'existe pas encore : on relève l'adresse de retour demandée par Keycloak
  // (la navigation vers cette adresse échoue ensuite, sans conséquence).
  let retour: URL | undefined;
  const surRequete = (r: Request): void => {
    if (r.url().startsWith(redirection)) retour = new URL(r.url());
  };
  page.on('request', surRequete);
  await page
    .goto(`${EMETTEUR}/protocol/openid-connect/auth?${parametres.toString()}`)
    .catch(() => undefined);
  if (options.identifiant && !retour) {
    await page.locator('#username').fill(options.identifiant);
    await page.locator('#password').fill(motDePasse(options.identifiant));
    await page.locator('#kc-login').click();
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
    await use({ jetons: new Map() });
  },
});

export const { Given, When, Then } = createBdd(test);
