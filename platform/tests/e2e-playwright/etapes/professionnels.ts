// Étapes « recrutement des professionnels » (ADR-0026) : invitation par l'équipe de recrutement,
// inscription du candidat dans Keycloak (vraie extension, vraie double authentification), fiche
// inactive dans le dossier. Données FICTIVES uniquement.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, type Request } from '@playwright/test';
import {
  APPLICATIONS,
  EMETTEUR,
  FHIR_URL,
  INVITATIONS_URL,
  KEYCLOAK_URL,
  PREFIXE_INSCRITS,
  ROYAUME,
  TELECONSULTATION_URL,
} from '../configuration.js';
import { Then, When, type Monde } from './fixtures.js';
import { codeUnique, retenirSecret } from './totp.js';

async function appeler(
  monde: Monde,
  methode: 'GET' | 'POST',
  chemin: string,
  identifiant?: string,
  corps?: unknown,
): Promise<void> {
  const jeton = identifiant ? monde.jetons.get(identifiant) : undefined;
  if (identifiant && !jeton) throw new Error(`${identifiant} n'est pas connecté dans ce scénario.`);
  const r = await fetch(`${INVITATIONS_URL}${chemin}`, {
    method: methode,
    headers: {
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
      ...(corps !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
  });
  monde.reponse = { statut: r.status, corps: (await r.json()) as Record<string, unknown> };
}

When(
  '{string} invite le professionnel {string} {string}',
  async ({ monde }, identifiant: string, nom: string, prenom: string) => {
    await appeler(monde, 'POST', '/professionnels', identifiant, { nom, prenom });
    if (monde.reponse?.statut === 201) {
      const c = monde.reponse.corps as { id: string; code: string; practitionerId: string };
      // Même mémoire que les autres invitations : les étapes d'inscription existantes servent.
      monde.invitation = { id: c.id, code: c.code };
      monde.candidat = { practitionerId: c.practitionerId };
    }
  },
);

When('une personne sans jeton invite un professionnel', async ({ monde }) => {
  await appeler(monde, 'POST', '/professionnels', undefined, { nom: 'Fictif', prenom: 'Anonyme' });
});

Then(
  "l'invitation du professionnel est refusée avec le statut {int}",
  ({ monde }, statut: number) => {
    expect(monde.reponse?.statut).toBe(statut);
    expect(monde.reponse?.corps['code']).toBeUndefined();
  },
);

When("{string} révoque l'invitation du professionnel", async ({ monde }, identifiant: string) => {
  await appeler(
    monde,
    'POST',
    `/professionnels/${monde.invitation?.id ?? ''}/revocation`,
    identifiant,
  );
  expect(monde.reponse?.statut).toBe(200);
});

Then(
  'le code est créé et la fiche du candidat est inactive, à vérifier, dans le dossier',
  async ({ monde }) => {
    expect(monde.reponse?.statut).toBe(201);
    expect(monde.invitation?.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const r = await fetch(
      `${FHIR_URL}/Practitioner/${monde.candidat?.practitionerId ?? 'absente'}`,
      {
        headers: { 'cache-control': 'no-cache' },
      },
    );
    expect(r.status).toBe(200);
    const p = (await r.json()) as {
      active?: boolean;
      extension?: { url: string; valueCode?: string }[];
      qualification?: unknown[];
    };
    expect(p.active).toBe(false);
    expect(p.extension?.find((e) => e.url.endsWith('/statut-verification'))?.valueCode).toBe(
      'a-verifier',
    );
    expect(p.qualification).toBeUndefined();
  },
);

When(
  'le candidat crée son compte avec ce code et configure la double authentification',
  async ({ page: pageDuScenario, monde }) => {
    // Page neuve : la page du scénario peut finir sur l'erreur Chrome d'un retour de connexion.
    const page = await pageDuScenario.context().newPage();
    const { clientId, redirection } = APPLICATIONS.pro;
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
    // L'espace professionnel n'existe pas sur ce port : on relève l'adresse de retour de Keycloak.
    let retour: URL | undefined;
    const surRequete = (r: Request): void => {
      if (r.url().startsWith(redirection)) retour = new URL(r.url());
    };
    page.on('request', surRequete);
    await page.goto(`${EMETTEUR}/protocol/openid-connect/registrations?${parametres.toString()}`);
    const identifiant = `${PREFIXE_INSCRITS}${randomBytes(4).toString('hex')}`;
    const motDePasse = `Fictif-${randomBytes(12).toString('base64url')}`;
    await page.locator('#code_invitation').fill(monde.invitation?.code ?? '');
    await page.locator('#username').fill(identifiant);
    await page.locator('#password').fill(motDePasse);
    await page.locator('#password-confirm').fill(motDePasse);
    await page.locator('#kc-register-form [type=submit]').click();
    // Aucune saisie d'identité de patient : la double authentification est demandée aussitôt.
    await expect(page.locator('#totp')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#kc-identite-form')).toHaveCount(0);
    retenirSecret(identifiant, await page.locator('#totpSecret').inputValue());
    await page.locator('#totp').fill(await codeUnique(identifiant));
    await page.locator('#userLabel').fill('Téléphone de test [FICTIF]');
    await page.locator('#saveTOTPBtn').click();
    await expect
      .poll(() => retour?.searchParams.get('code') ?? '', { timeout: 15_000 })
      .not.toBe('');
    page.off('request', surRequete);
    const r = await fetch(`${EMETTEUR}/protocol/openid-connect/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: retour?.searchParams.get('code') ?? '',
        redirect_uri: redirection,
        code_verifier: verificateur,
      }),
    });
    expect(r.status).toBe(200);
    const jeton = ((await r.json()) as { access_token: string }).access_token;
    monde.inscription = { identifiant, page, motDePasse, jeton };
    await page.context().clearCookies();
  },
);

async function jetonAdministrateur(): Promise<string> {
  const r = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: process.env['KC_BOOTSTRAP_ADMIN_USERNAME'] ?? 'admin',
      password: process.env['KC_BOOTSTRAP_ADMIN_PASSWORD'] ?? '',
    }),
  });
  expect(r.status).toBe(200);
  return ((await r.json()) as { access_token: string }).access_token;
}

Then(
  'son compte a le seul rôle professionnel-candidat, rattaché à sa fiche, avec la double authentification',
  async ({ monde }) => {
    const jeton = await jetonAdministrateur();
    const admin = (chemin: string) =>
      fetch(`${KEYCLOAK_URL}/admin/realms/${ROYAUME}${chemin}`, {
        headers: { authorization: `Bearer ${jeton}` },
      }).then((r) => r.json());
    const [compte] = (await admin(
      `/users?username=${monde.inscription?.identifiant ?? ''}&exact=true`,
    )) as { id: string; attributes?: Record<string, string[]> }[];
    expect(compte?.attributes?.['practitioner_id']).toEqual([monde.candidat?.practitionerId]);
    for (const autre of ['patient_id', 'related_person_id']) {
      expect(compte?.attributes?.[autre]).toBeUndefined();
    }
    const roles = (
      (await admin(`/users/${compte?.id ?? ''}/role-mappings/realm/composite`)) as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(roles).toContain('professionnel-candidat');
    expect(roles).toContain('mfa-requise');
    // Jamais le rôle professionnel : seule la vérification par une personne habilitée le donnera.
    for (const autre of ['professionnel', 'patient', 'proche', 'recrutement', 'agent-ia']) {
      expect(roles).not.toContain(autre);
    }
    const identifiants = (await admin(`/users/${compte?.id ?? ''}/credentials`)) as {
      type: string;
    }[];
    expect(identifiants.map((c) => c.type)).toContain('otp');
  },
);

Then(
  "l'invitation du professionnel est {string} pour {string}",
  async ({ monde }, statut: string, identifiant: string) => {
    await appeler(monde, 'GET', '/professionnels', identifiant);
    expect(monde.reponse?.statut).toBe(200);
    const liste = monde.reponse?.corps['invitations'] as { id: string; statut: string }[];
    expect(liste.find((i) => i.id === monde.invitation?.id)?.statut).toBe(statut);
  },
);

Then('le candidat ne peut pas publier de créneaux', async ({ monde }) => {
  const debut = new Date(Date.now() + 20 * 86_400_000);
  debut.setUTCSeconds(0, 0);
  const r = await fetch(`${TELECONSULTATION_URL}/creneaux`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${monde.inscription?.jeton ?? ''}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ debut: debut.toISOString(), dureeMinutes: 20, nombre: 1 }),
  });
  expect(r.status).toBe(403);
});

Then("l'annuaire de {string} ne montre pas ce candidat", async ({ monde }, identifiant: string) => {
  const r = await fetch(`${TELECONSULTATION_URL}/praticiens`, {
    headers: { authorization: `Bearer ${monde.jetons.get(identifiant) ?? ''}` },
  });
  expect(r.status).toBe(200);
  const ids = ((await r.json()) as { praticiens: { id: string }[] }).praticiens.map((p) => p.id);
  expect(ids.length).toBeGreaterThan(0);
  expect(ids).not.toContain(monde.candidat?.practitionerId);
});
