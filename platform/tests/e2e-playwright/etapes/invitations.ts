// Étapes « accès sur invitation » (ADR-0013). Données FICTIVES uniquement.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type Page, type Request } from '@playwright/test';
import { EXTENSION_STATUT_IDENTITE } from '@mbolo/dossier-fhir';
import {
  APP_PATIENT_URL,
  APPLICATIONS,
  COHORTE_TEST,
  compte,
  EMETTEUR,
  FHIR_URL,
  INVITATIONS_URL,
  KEYCLOAK_URL,
  PREFIXE_INSCRITS,
  ROYAUME,
  TELECONSULTATION_URL,
} from '../configuration.js';
import { Given, Then, When, type Monde } from './fixtures.js';
import { codeSmsRecu } from './niveau.js';
import { verifierAccessibilite } from './accessibilite.js';

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

/** [FICTIF] Identité saisie après l'inscription (ADR-0014) ; aucun nom réel. */
const IDENTITE_FICTIVE = {
  nom: 'Test',
  prenom: 'Inscrite',
  naissance: '1995-02-03',
  telephone: '+241 00 00 00 04',
  numero_assurance: 'FICTIF-INSCR',
};

/**
 * Formulaire « Mon identité » de Keycloak, affiché juste après l'inscription, puis code reçu au
 * numéro saisi (revue ASVS n°2, C8). Avec `corrigerEn`, la personne corrige d'abord son numéro.
 */
async function saisirIdentite(
  page: Page,
  naissance = IDENTITE_FICTIVE.naissance,
  corrigerEn?: string,
): Promise<void> {
  await expect(page.locator('#kc-identite-form')).toBeVisible();
  await verifierAccessibilite(page, 'Keycloak : Mon identité');
  for (const [champ, valeur] of Object.entries({ ...IDENTITE_FICTIVE, naissance })) {
    await page.locator(`#${champ}`).fill(valeur);
  }
  await page.locator('#sexe').selectOption('female');
  let depuis = new Date().toISOString();
  await page.locator('#kc-identite-form [type=submit]').click();
  await page.waitForLoadState().catch(() => undefined);
  // Identité refusée (ex. naissance dans le futur) : aucun code, le formulaire reste affiché.
  if (!(await page.locator('#kc-verification-telephone-form').count())) return;
  let telephone = IDENTITE_FICTIVE.telephone;
  // Le numéro saisi est rappelé, pour repérer une faute de frappe.
  await expect(page.locator('body')).toContainText(`envoyé par SMS au ${telephone}`);
  await verifierAccessibilite(page, 'Keycloak : code de vérification du numéro');
  if (corrigerEn) {
    await page.locator('#kc-corriger').click();
    await expect(page.locator('#kc-identite-form')).toBeVisible();
    await expect(page.locator('#nom')).toHaveValue(IDENTITE_FICTIVE.nom);
    await page.locator('#telephone').fill(corrigerEn);
    await page.locator('#kc-identite-form [type=submit]').click();
    // Un code par minute : le nouveau numéro attend, la saisie est conservée.
    await expect(page.locator('body')).toContainText('Attendez une minute');
    await expect(page.locator('#telephone')).toHaveValue(corrigerEn);
    await page.waitForTimeout(61_000);
    depuis = new Date().toISOString();
    await page.locator('#kc-identite-form [type=submit]').click();
    telephone = corrigerEn;
    await expect(page.locator('body')).toContainText(`envoyé par SMS au ${telephone}`);
    // Un nouveau code demandé trop tôt : on reste sur la page du code, le premier vaut encore.
    await page.locator('#kc-renvoyer').click();
    await expect(page.locator('body')).toContainText('Attendez une minute');
    await expect(page.locator('#code_sms')).toBeVisible();
  }
  await page.locator('#code_sms').fill(await codeSmsRecu(telephone, depuis));
  await page.locator('#kc-submit').click();
  await page.waitForLoadState().catch(() => undefined);
}

async function inscrire(
  pageDuScenario: Page,
  monde: Monde,
  code: string,
  naissance?: string,
  corrigerEn?: string,
): Promise<void> {
  // Page neuve : la page du scénario peut encore finir sur l'erreur Chrome d'un retour de connexion
  // précédent (faux port 5173), qui interromprait la navigation vers Keycloak.
  const page = await pageDuScenario.context().newPage();
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
  // Compte créé : Keycloak demande aussitôt l'identité, qui va dans le dossier.
  if (await page.locator('#kc-identite-form').count()) {
    await saisirIdentite(page, naissance, corrigerEn);
  }
  await page.waitForTimeout(500);
  page.off('request', surRequete);
  monde.inscription = { identifiant, page, motDePasse };
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

When("une personne ouvre le formulaire d'inscription", async ({ context, monde }) => {
  const page = await context.newPage();
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

Then('son dossier est créé avec une identité à vérifier', async ({ monde }) => {
  const patientId = revendications(monde.inscription?.jeton ?? '')['patient_id'];
  expect(patientId, 'compte rattaché à son dossier').toEqual(expect.any(String));
  // Lecture directe du serveur de test (hors passerelle), pour vérifier ce qui est enregistré.
  const r = await fetch(`${FHIR_URL}/Patient/${String(patientId)}`, {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(r.status).toBe(200);
  const p = (await r.json()) as Record<string, unknown>;
  expect(JSON.stringify(p['extension'])).toContain('a-verifier');
  expect(p['birthDate']).toBe(IDENTITE_FICTIVE.naissance);
  expect(JSON.stringify(p['name'])).toContain(IDENTITE_FICTIVE.prenom);
  expect(JSON.stringify(p['meta'])).toContain('fictif');
  // Le statut vu par le patient.
  const s = await fetch(`${TELECONSULTATION_URL}/identite`, {
    headers: { authorization: `Bearer ${monde.inscription?.jeton ?? ''}` },
  });
  expect(await s.json()).toEqual({ statut: 'a-verifier' });
});

When(
  "une personne s'inscrit avec ce code, puis corrige son numéro en {string}",
  async ({ page, monde }, telephone: string) => {
    test.setTimeout(120_000);
    await inscrire(page, monde, monde.invitation?.code ?? '', undefined, telephone);
  },
);

Then('son dossier porte le numéro {string}', async ({ monde }, telephone: string) => {
  const patientId = revendications(monde.inscription?.jeton ?? '')['patient_id'];
  const r = await fetch(`${FHIR_URL}/Patient/${String(patientId)}`, {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(r.status).toBe(200);
  const p = (await r.json()) as { telecom?: { value?: string }[] };
  expect(p.telecom?.map((t) => t.value)).toEqual([telephone]);
});

When(
  "une personne s'inscrit avec ce code en indiquant une naissance dans le futur",
  async ({ page, monde }) => {
    await inscrire(page, monde, monde.invitation?.code ?? '', '2999-01-01');
  },
);

Then("le formulaire d'identité signale la date de naissance", async ({ monde }) => {
  const page = monde.inscription?.page;
  if (!page) throw new Error('inscription non tentée');
  expect(monde.inscription?.jeton).toBeUndefined();
  await expect(page.locator('#kc-identite-form')).toBeVisible();
  await expect(page.getByText('Indiquez une date de naissance valable.')).toBeVisible();
  // Le reste de la saisie est conservé : on ne corrige que la date.
  await expect(page.locator('#nom')).toHaveValue(IDENTITE_FICTIVE.nom);
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
  async ({ context, monde }) => {
    const identifiant = `${PREFIXE_INSCRITS}${randomBytes(4).toString('hex')}`;
    const motDePasse = `Fictif-${randomBytes(12).toString('base64url')}`;
    // Nouvelle page : sur celle de l'étape de connexion, le retour de Keycloak vers le faux port
    // (jamais servi) finit en page d'erreur et pouvait interrompre cette navigation.
    const page = await context.newPage();
    await page.goto(`${APP_PATIENT_URL}/`);
    await page.getByRole('button', { name: /J'ai un code d'invitation/ }).click();
    await page.locator('#code_invitation').fill(monde.invitation?.code ?? '');
    await page.locator('#username').fill(identifiant);
    await page.locator('#password').fill(motDePasse);
    await page.locator('#password-confirm').fill(motDePasse);
    await page.locator('#kc-register-form [type=submit]').click();
    await page.waitForLoadState().catch(() => undefined);
    await saisirIdentite(page);
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

// ── Réservation bloquée tant que l'identité n'est pas vérifiée (ADR-0014) ───

When(
  '{string} tente de réserver ce créneau alors que son identité est à vérifier',
  async ({ monde }, identifiant: string) => {
    const jeton = monde.jetons.get(identifiant);
    if (!jeton) throw new Error(`${identifiant} n'est pas connecté.`);
    const url = `${FHIR_URL}/Patient/${compte(identifiant).attributs['patient_id'] ?? ''}`;
    const original = (await (
      await fetch(url, { headers: { 'cache-control': 'no-cache' } })
    ).json()) as Record<string, unknown>;
    const ecrire = (corps: unknown) =>
      fetch(url, {
        method: 'PUT',
        headers: { 'content-type': 'application/fhir+json' },
        body: JSON.stringify(corps),
      });
    // Le temps du scénario seulement : l'identité repasse « à vérifier », puis est rétablie.
    expect(
      (
        await ecrire({
          ...original,
          extension: [{ url: EXTENSION_STATUT_IDENTITE, valueCode: 'a-verifier' }],
        })
      ).ok,
    ).toBe(true);
    try {
      const r = await fetch(`${TELECONSULTATION_URL}/rendez-vous`, {
        method: 'POST',
        headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
        body: JSON.stringify({ creneauId: monde.creneaux?.[0] ?? '' }),
      });
      monde.reponse = { statut: r.status, corps: (await r.json()) as Record<string, unknown> };
    } finally {
      await ecrire(original);
    }
  },
);

Then("la réservation est refusée car son identité n'est pas vérifiée", ({ monde }) => {
  expect(monde.reponse?.statut).toBe(403);
  expect(String(monde.reponse?.corps['erreur'])).toContain('identité doit être vérifiée');
});
