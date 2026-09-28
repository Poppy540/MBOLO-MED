// Étapes « invitation d'un proche » (ADR-0019) : API du service invitations avec le jeton du
// patient, vérifications dans le dossier FHIR de test et la boîte des SMS simulés.
// Données FICTIVES uniquement (numéros manifestement inventés).
import { randomBytes } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import {
  APP_PATIENT_URL,
  FHIR_URL,
  IDENTITE_URL,
  INVITATIONS_URL,
  KEYCLOAK_URL,
  NOTIFICATIONS_URL,
  PREFIXE_INSCRITS,
  ROYAUME,
} from '../configuration.js';
import { jetonService } from './dossier.js';
import { Given, Then, When, type Monde } from './fixtures.js';
import { codeUnique, retenirSecret } from './totp.js';

const LIENS: Record<string, string> = { enfant: 'CHILD', conjoint: 'SPS', parent: 'PRN' };
/** Proche de test permanent (autres scénarios) : jamais retiré ici. */
const PROCHE_PERMANENT = 'RelatedPerson/rp-fictif-001';

async function appeler(
  monde: Monde,
  methode: 'GET' | 'POST',
  chemin: string,
  jeton: string | undefined,
  corps?: unknown,
): Promise<void> {
  const r = await fetch(`${INVITATIONS_URL}${chemin}`, {
    method: methode,
    headers: {
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
      ...(corps !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
  });
  monde.reponse = {
    statut: r.status,
    corps: (await r.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

async function inviter(
  monde: Monde,
  identifiant: string | undefined,
  prenom: string,
  lien: string,
  telephone: string,
) {
  await appeler(
    monde,
    'POST',
    '/proches',
    identifiant ? monde.jetons.get(identifiant) : undefined,
    {
      prenom,
      lien: LIENS[lien] ?? lien,
      telephone,
      versionTexte: 'c-proche-v0.1-brouillon',
    },
  );
  if (monde.reponse?.statut === 201) {
    const c = monde.reponse.corps;
    monde.proche = {
      id: String(c['id']),
      code: String(c['code']),
      relatedPersonId: String(c['relatedPersonId']),
      prenom,
    };
  }
}

interface Consentement {
  id: string;
  category?: { coding?: { code?: string }[] }[];
  provision?: { actor?: { reference?: { reference?: string } }[] };
}

/** Partages C-PROCHE actifs du patient de test, lus dans le dossier. */
async function partagesProches(): Promise<Consentement[]> {
  const r = await fetch(
    `${FHIR_URL}/Consent?patient=Patient/pat-fictif-001&status=active&_count=200`,
    {
      headers: { 'cache-control': 'no-cache' },
    },
  );
  expect(r.status).toBe(200);
  const b = (await r.json()) as { entry?: { resource: Consentement }[] };
  return (b.entry ?? [])
    .map((e) => e.resource)
    .filter((c) => c.category?.[0]?.coding?.[0]?.code === 'C-PROCHE');
}

const beneficiaire = (c: Consentement) => c.provision?.actor?.[0]?.reference?.reference ?? '';

async function retirer(jeton: string, c: Consentement): Promise<void> {
  const r = await fetch(`${IDENTITE_URL}/consentements/${c.id}/revocation`, {
    method: 'POST',
    headers: { authorization: `Bearer ${jeton}` },
  });
  expect(r.status).toBe(200);
}

/** Retire les proches invités ici (invitations en cours ou comptes créés) et leurs partages. */
async function nettoyer(monde: Monde, identifiant: string): Promise<void> {
  const jeton = monde.jetons.get(identifiant) ?? '';
  await appeler(monde, 'GET', '/proches', jeton);
  expect(monde.reponse?.statut).toBe(200);
  const proches = (monde.reponse?.corps['proches'] ?? []) as { id: string; statut: string }[];
  // Invitations en cours et proches qui ont déjà leur compte : tous comptent dans la limite.
  for (const p of proches.filter((x) => x.statut === 'valide' || x.statut === 'utilise')) {
    await appeler(monde, 'POST', `/proches/${p.id}/revocation`, jeton);
    expect(monde.reponse?.statut).toBe(200);
  }
  for (const c of await partagesProches()) {
    if (beneficiaire(c) !== PROCHE_PERMANENT) await retirer(jeton, c);
  }
}

Given(
  "{string} n'a aucune invitation de proche en cours",
  async ({ monde }, identifiant: string) => {
    await nettoyer(monde, identifiant);
  },
);

When(
  '{string} invite son proche {string}, son {word}, au numéro {string}',
  async ({ monde }, identifiant: string, prenom: string, lien: string, telephone: string) => {
    await inviter(monde, identifiant, prenom, lien, telephone);
  },
);

When('une personne sans jeton invite un proche', async ({ monde }) => {
  await inviter(monde, undefined, 'Paul [FICTIF]', 'enfant', '+33000000009');
});

When('{string} invite {int} proches', async ({ monde }, identifiant: string, n: number) => {
  for (let i = 0; i < n; i++) {
    await inviter(monde, identifiant, `Proche ${i + 1} [FICTIF]`, 'enfant', '+33000000009');
    expect(monde.reponse?.statut).toBe(201);
  }
});

Then("l'invitation du proche est créée et le code envoyé par SMS", ({ monde }) => {
  expect(monde.reponse?.statut).toBe(201);
  expect(monde.reponse?.corps['sms']).toBe('envoyee');
  expect(monde.proche?.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
});

Then(
  'le numéro {string} reçoit ce code, sans le nom du patient ni aucune donnée de santé',
  async ({ monde }, telephone: string) => {
    const r = await fetch(`${NOTIFICATIONS_URL}/simulation/boite`, {
      headers: { authorization: `Bearer ${await jetonService('téléconsultation')}` },
    });
    expect(r.status).toBe(200);
    const recus = (
      (await r.json()) as { messages: { telephone: string; texte: string; date: string }[] }
    ).messages.filter((m) => m.telephone === telephone && m.date >= (monde.depuis ?? ''));
    const sms = recus.find((m) => m.texte.includes(monde.proche?.code ?? 'absent'));
    expect(sms?.texte).toContain('valable 7 jours');
    // Ni le patient (nom, identifiant), ni le prénom saisi, ni aucune donnée de santé.
    expect(sms?.texte).not.toMatch(/pat-|Fictif|Serge|prac-|ordonnance|consultation du/i);
  },
);

Then(
  'le dossier contient la fiche inactive du proche, avec son prénom et le lien seulement',
  async ({ monde }) => {
    const r = await fetch(
      `${FHIR_URL}/RelatedPerson/${monde.proche?.relatedPersonId ?? 'absente'}`,
      {
        headers: { 'cache-control': 'no-cache' },
      },
    );
    expect(r.status).toBe(200);
    const f = (await r.json()) as Record<string, unknown>;
    expect(f).toMatchObject({
      active: false,
      patient: { reference: 'Patient/pat-fictif-001' },
      name: [{ given: [monde.proche?.prenom] }],
      relationship: [{ coding: [{ code: 'CHILD' }] }],
    });
    for (const interdit of ['telecom', 'address', 'birthDate', 'gender', 'identifier']) {
      expect(f[interdit]).toBeUndefined();
    }
  },
);

Then('le partage avec ce proche est actif dans le dossier', async ({ monde }) => {
  const cible = `RelatedPerson/${monde.proche?.relatedPersonId ?? 'absente'}`;
  expect((await partagesProches()).filter((c) => beneficiaire(c) === cible)).toHaveLength(1);
});

Then('le code du proche ne permet pas de créer un compte patient', async ({ monde }) => {
  const r = await fetch(`${INVITATIONS_URL}/invitations/verification`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: monde.proche?.code ?? '' }),
  });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ valide: false });
});

When('{string} annule cette invitation de proche', async ({ monde }, identifiant: string) => {
  await appeler(
    monde,
    'POST',
    `/proches/${monde.proche?.id ?? ''}/revocation`,
    monde.jetons.get(identifiant),
  );
  expect(monde.reponse?.statut).toBe(200);
});

Then("l'invitation du proche est {string}", async ({ monde }, statut: string) => {
  const id = monde.proche?.id;
  await appeler(monde, 'GET', '/proches', monde.jetons.get('patient-fictif-01'));
  const proches = (monde.reponse?.corps['proches'] ?? []) as { id: string; statut: string }[];
  expect(proches.find((p) => p.id === id)?.statut).toBe(statut);
});

When('{string} retire le partage avec ce proche', async ({ monde }, identifiant: string) => {
  const cible = `RelatedPerson/${monde.proche?.relatedPersonId ?? 'absente'}`;
  for (const c of (await partagesProches()).filter((x) => beneficiaire(x) === cible)) {
    await retirer(monde.jetons.get(identifiant) ?? '', c);
  }
  expect((await partagesProches()).filter((c) => beneficiaire(c) === cible)).toHaveLength(0);
});

When(
  '{string} annule toutes ses invitations de proches et retire ces partages',
  async ({ monde }, identifiant: string) => {
    await nettoyer(monde, identifiant);
  },
);

Then("l'invitation du proche est refusée avec le statut {int}", ({ monde }, statut: number) => {
  expect(monde.reponse?.statut).toBe(statut);
  expect(monde.reponse?.corps['code']).toBeUndefined();
});

// ── Inscription du proche avec son code (ADR-0019) ───────────────────────────

When(
  'le proche crée son compte avec ce code depuis l’application patient',
  async ({ page, monde }) => {
    const identifiant = `${PREFIXE_INSCRITS}${randomBytes(4).toString('hex')}`;
    const motDePasse = `Fictif-${randomBytes(12).toString('base64url')}`;
    await page.goto(`${APP_PATIENT_URL}/`);
    await page.getByRole('button', { name: /J'ai un code d'invitation/ }).click();
    await page.locator('#code_invitation').fill(monde.proche?.code ?? '');
    await page.locator('#username').fill(identifiant);
    await page.locator('#password').fill(motDePasse);
    await page.locator('#password-confirm').fill(motDePasse);
    await page.locator('#kc-register-form [type=submit]').click();
    await page.waitForLoadState().catch(() => undefined);
    monde.inscription = { identifiant, page };
  },
);

Then(
  'il configure la double authentification et arrive sur les documents partagés par son proche',
  async ({ monde }) => {
    const page: Page | undefined = monde.inscription?.page;
    const identifiant = monde.inscription?.identifiant ?? '';
    if (!page) throw new Error('inscription non tentée');
    // Aucune saisie d'identité (réservée aux patients) : la configuration de l'OTP vient aussitôt.
    await expect(page.locator('#kc-identite-form')).toHaveCount(0);
    const secret = page.locator('#totpSecret');
    await expect(secret).toHaveCount(1, { timeout: 15_000 });
    retenirSecret(identifiant, await secret.inputValue());
    await page.locator('#totp').fill(await codeUnique(identifiant));
    await page.locator('#userLabel').fill('Téléphone de test [FICTIF]');
    await page.locator('#saveTOTPBtn').click();
    await expect(
      page.getByRole('heading', { name: 'Ordonnances et consignes de votre proche' }),
    ).toBeVisible({ timeout: 15_000 });
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
  'son compte a le seul rôle proche, rattaché à la fiche du proche, avec la double authentification',
  async ({ monde }) => {
    const jeton = await jetonAdministrateur();
    const admin = (chemin: string) =>
      fetch(`${KEYCLOAK_URL}/admin/realms/${ROYAUME}${chemin}`, {
        headers: { authorization: `Bearer ${jeton}` },
      }).then((r) => r.json());
    const [compte] = (await admin(
      `/users?username=${monde.inscription?.identifiant ?? ''}&exact=true`,
    )) as { id: string; attributes?: Record<string, string[]> }[];
    expect(compte?.attributes?.['related_person_id']).toEqual([monde.proche?.relatedPersonId]);
    expect(compte?.attributes?.['patient_id']).toBeUndefined();
    const roles = (
      (await admin(`/users/${compte?.id ?? ''}/role-mappings/realm/composite`)) as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(roles).toContain('proche');
    expect(roles).toContain('mfa-requise');
    for (const autre of ['patient', 'professionnel', 'infirmier', 'administrateur', 'agent-ia']) {
      expect(roles).not.toContain(autre);
    }
    const identifiants = (await admin(`/users/${compte?.id ?? ''}/credentials`)) as {
      type: string;
    }[];
    expect(identifiants.map((c) => c.type)).toContain('otp');
  },
);

async function fiche(monde: Monde): Promise<Record<string, unknown>> {
  const r = await fetch(`${FHIR_URL}/RelatedPerson/${monde.proche?.relatedPersonId ?? 'absente'}`, {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(r.status).toBe(200);
  return (await r.json()) as Record<string, unknown>;
}

Then('la fiche du proche est active dans le dossier', async ({ monde }) => {
  expect((await fiche(monde))['active']).toBe(true);
});

When('{string} retire ce proche', async ({ monde }, identifiant: string) => {
  await appeler(
    monde,
    'POST',
    `/proches/${monde.proche?.id ?? ''}/revocation`,
    monde.jetons.get(identifiant),
  );
  expect(monde.reponse?.statut).toBe(200);
});

Then('la fiche du proche est inactive et le partage retiré', async ({ monde }) => {
  expect((await fiche(monde))['active']).toBe(false);
  const cible = `RelatedPerson/${monde.proche?.relatedPersonId ?? 'absente'}`;
  expect((await partagesProches()).filter((c) => beneficiaire(c) === cible)).toHaveLength(0);
});
