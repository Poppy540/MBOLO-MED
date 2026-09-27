// Étapes « accès sur invitation » (ADR-0013). Données FICTIVES uniquement.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, type Page, type Request } from '@playwright/test';
import {
  APP_PATIENT_URL,
  APPLICATIONS,
  COHORTE_TEST,
  EMETTEUR,
  INVITATIONS_URL,
  KEYCLOAK_URL,
  PREFIXE_INSCRITS,
  ROYAUME,
} from '../configuration.js';
import { Given, Then, When, type Monde } from './fixtures.js';

async function appeler(
  monde: Monde,
  methode: 'GET' | 'POST',
  chemin: string,
  options: { identifiant?: string; corps?: unknown } = {},
): Promise<void> {
  const jeton = options.identifiant ? monde.jetons.get(options.identifiant) : undefined;
  if (options.identifiant && !jeton) {
    throw new Error(`${options.identifiant} n'est pas connecté dans ce scénario.`);
  }
  const r = await fetch(`${INVITATIONS_URL}${chemin}`, {
    method: methode,
    headers: {
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
      ...(options.corps !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(options.corps !== undefined ? { body: JSON.stringify(options.corps) } : {}),
  });
  monde.reponse = { statut: r.status, corps: (await r.json()) as Record<string, unknown> };
}

When(
  '{string} crée une invitation pour la cohorte de test',
  async ({ monde }, identifiant: string) => {
    await appeler(monde, 'POST', '/invitations', {
      identifiant,
      corps: { cohorte: COHORTE_TEST },
    });
    if (monde.reponse?.statut === 201) {
      const { id, code } = monde.reponse.corps as { id: string; code: string };
      monde.invitation = { id, code };
    }
  },
);

When('{string} révoque cette invitation', async ({ monde }, identifiant: string) => {
  await appeler(monde, 'POST', `/invitations/${monde.invitation?.id ?? ''}/revocation`, {
    identifiant,
  });
  expect(monde.reponse?.statut).toBe(200);
});

When("quelqu'un présente le code {string}", async ({ monde }, code: string) => {
  await appeler(monde, 'POST', '/invitations/verification', { corps: { code } });
});

Then('un code de 8 caractères lui est montré une seule fois', ({ monde }) => {
  expect(monde.reponse?.statut).toBe(201);
  expect(monde.invitation?.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  expect(monde.reponse?.corps['cohorte']).toBe(COHORTE_TEST);
});

Then('le code est reconnu comme valable', async ({ monde }) => {
  await appeler(monde, 'POST', '/invitations/verification', {
    corps: { code: monde.invitation?.code ?? '' },
  });
  expect(monde.reponse).toEqual({ statut: 200, corps: { valide: true } });
});

Then("le code n'est pas reconnu", async ({ monde }) => {
  if (monde.invitation) {
    await appeler(monde, 'POST', '/invitations/verification', {
      corps: { code: monde.invitation.code },
    });
  }
  expect(monde.reponse).toEqual({ statut: 200, corps: { valide: false } });
});

Then(
  "la liste des invitations de la cohorte contient l'invitation sans son code",
  async ({ monde }) => {
    const { id, code } = monde.invitation ?? { id: '', code: '' };
    await appeler(monde, 'GET', `/invitations?cohorte=${COHORTE_TEST}`, {
      identifiant: 'gestionnaire-fictif-01',
    });
    expect(monde.reponse?.statut).toBe(200);
    const liste = monde.reponse?.corps['invitations'] as Record<string, unknown>[];
    expect(liste).toContainEqual(expect.objectContaining({ id, statut: 'valide' }));
    expect(JSON.stringify(liste)).not.toContain(code);
  },
);

// ── Inscription avec un code (ADR-0014) ─────────────────────────────────────

/** Formulaire d'inscription de Keycloak pour l'application patient, avec défi PKCE. */
async function ouvrirInscription(page: Page): Promise<string> {
  const { clientId, redirection } = APPLICATIONS.patient;
  const verificateur = randomBytes(32).toString('base64url');
  const parametres = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'openid',
    redirect_uri: redirection,
    state: randomUUID(),
    code_challenge: createHash('sha256').update(verificateur).digest('base64url'),
    code_challenge_method: 'S256',
  });
  await page.goto(`${EMETTEUR}/protocol/openid-connect/registrations?${parametres.toString()}`);
  return verificateur;
}

async function inscrire(page: Page, monde: Monde, code: string): Promise<void> {
  const identifiant = `${PREFIXE_INSCRITS}${randomBytes(4).toString('hex')}`;
  const { clientId, redirection } = APPLICATIONS.patient;
  const verificateur = await ouvrirInscription(page);
  // L'application n'existe pas sur ce port : on relève l'adresse de retour demandée par Keycloak.
  let retour: URL | undefined;
  const surRequete = (r: Request): void => {
    if (r.url().startsWith(redirection)) retour = new URL(r.url());
  };
  page.on('request', surRequete);
  const motDePasse = `Fictif-${randomBytes(12).toString('base64url')}`;
  await page.locator('#code_invitation').fill(code);
  await page.locator('#username').fill(identifiant);
  await page.locator('#password').fill(motDePasse);
  await page.locator('#password-confirm').fill(motDePasse);
  await page.locator('#kc-register-form [type=submit]').click();
  await page.waitForLoadState().catch(() => undefined);
  await page.waitForTimeout(500);
  page.off('request', surRequete);
  monde.inscription = { identifiant, page };
  const autorisation = retour?.searchParams.get('code');
  if (!autorisation) return;
  const r = await fetch(`${EMETTEUR}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: autorisation,
      redirect_uri: redirection,
      code_verifier: verificateur,
    }),
  });
  expect(r.status).toBe(200);
  monde.inscription.jeton = ((await r.json()) as { access_token: string }).access_token;
  await page.context().clearCookies();
}

Given("une personne s'inscrit avec ce code", async ({ page, monde }) => {
  await inscrire(page, monde, monde.invitation?.code ?? '');
});

When("une personne s'inscrit avec le code {string}", async ({ page, monde }, code: string) => {
  await inscrire(page, monde, code);
});

When("une autre personne s'inscrit avec le même code", async ({ page, monde }) => {
  await inscrire(page, monde, monde.invitation?.code ?? '');
});

When("une personne ouvre le formulaire d'inscription", async ({ page, monde }) => {
  await ouvrirInscription(page);
  monde.inscription = { identifiant: '', page };
});

const revendications = (jeton: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(jeton.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;

Then(
  'son compte est créé avec le seul rôle patient, sans nom ni e-mail dans le jeton',
  ({ monde }) => {
    const jeton = monde.inscription?.jeton;
    expect(jeton, 'jeton obtenu après l’inscription').toBeTruthy();
    const r = revendications(jeton ?? '');
    const roles = (r['realm_access'] as { roles: string[] }).roles;
    expect(roles).toContain('patient');
    for (const autre of [
      'professionnel',
      'infirmier',
      'pharmacien',
      'administrateur',
      'revue-acces',
      'gestion-invitations',
      'agent-ia',
    ]) {
      expect(roles).not.toContain(autre);
    }
    for (const cle of ['email', 'name', 'given_name', 'family_name', 'preferred_username']) {
      expect(r).not.toHaveProperty(cle);
    }
  },
);

Then('son dossier reste à compléter avant toute consultation', ({ monde }) => {
  // Aucun dossier rattaché tant que l'identité n'est pas saisie et vérifiée (ADR-0014).
  expect(revendications(monde.inscription?.jeton ?? '')).not.toHaveProperty('patient_id');
});

Then("l'inscription est refusée avec le message « Code non reconnu »", async ({ monde }) => {
  expect(monde.inscription?.jeton).toBeUndefined();
  const page = monde.inscription?.page;
  if (!page) throw new Error('inscription non tentée');
  await expect(page.getByText('Code non reconnu').first()).toBeVisible();
});

Then("aucun compte n'est créé pour cette personne", async ({ monde }) => {
  const identifiant = monde.inscription?.identifiant ?? '';
  const r = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: process.env['KC_BOOTSTRAP_ADMIN_USERNAME'] ?? 'admin',
      password: process.env['KC_BOOTSTRAP_ADMIN_PASSWORD'] ?? '',
    }),
  });
  const { access_token: jeton } = (await r.json()) as { access_token: string };
  const comptes = (await (
    await fetch(
      `${KEYCLOAK_URL}/admin/realms/${ROYAUME}/users?username=${identifiant}&exact=true`,
      { headers: { authorization: `Bearer ${jeton}` } },
    )
  ).json()) as unknown[];
  expect(comptes).toHaveLength(0);
});

Then(
  "le formulaire demande un code d'invitation, un identifiant et un mot de passe seulement",
  async ({ monde }) => {
    const page = monde.inscription?.page;
    if (!page) throw new Error('formulaire non ouvert');
    for (const champ of ['#code_invitation', '#username', '#password', '#password-confirm']) {
      await expect(page.locator(champ)).toBeVisible();
    }
    for (const champ of ['#email', '#firstName', '#lastName']) {
      await expect(page.locator(champ)).toHaveCount(0);
    }
  },
);

// ── Inscription depuis l'application patient ────────────────────────────────

When(
  "une personne s'inscrit avec ce code depuis l'application patient",
  async ({ page, monde }) => {
    const identifiant = `${PREFIXE_INSCRITS}${randomBytes(4).toString('hex')}`;
    const motDePasse = `Fictif-${randomBytes(12).toString('base64url')}`;
    await page.goto(`${APP_PATIENT_URL}/`);
    await page.getByRole('button', { name: /J'ai un code d'invitation/ }).click();
    await page.locator('#code_invitation').fill(monde.invitation?.code ?? '');
    await page.locator('#username').fill(identifiant);
    await page.locator('#password').fill(motDePasse);
    await page.locator('#password-confirm').fill(motDePasse);
    await page.locator('#kc-register-form [type=submit]').click();
    monde.inscription = { identifiant, page };
  },
);

Then(
  "l'application indique que son identité doit être vérifiée avant toute consultation",
  async ({ monde }) => {
    const page = monde.inscription?.page;
    if (!page) throw new Error('inscription non tentée');
    await expect(page.getByText('Votre compte est créé.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('votre identité doit être vérifiée')).toBeVisible();
    // Aucune réservation possible avant la vérification.
    await expect(
      page.getByRole('button', { name: /Prendre rendez-vous|Choisir un médecin/ }),
    ).toHaveCount(0);
  },
);
