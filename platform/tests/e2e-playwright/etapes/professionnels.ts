// Étapes « recrutement des professionnels » (ADR-0026) : invitation par l'équipe de recrutement,
// inscription du candidat dans Keycloak (vraie extension, vraie double authentification), fiche
// inactive dans le dossier. Données FICTIVES uniquement.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, type Browser, type Request } from '@playwright/test';
import {
  APPLICATIONS,
  APP_PRO_URL,
  DOCUMENTS_URL,
  EMETTEUR,
  FHIR_URL,
  INVITATIONS_URL,
  KEYCLOAK_URL,
  PREFIXE_INSCRITS,
  ROYAUME,
  TELECONSULTATION_URL,
} from '../configuration.js';
import { Then, When, type Monde } from './fixtures.js';
import { pngFictif } from './documents.js';
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

// ── Dossier de candidature (service documents, ADR-0026) ────────────────────

const VERSION_CHARTE_PRO = 'c-verification-pro-v0.1';

const candidature = (jeton: string, chemin: string, init: RequestInit = {}) =>
  fetch(`${DOCUMENTS_URL}/candidature${chemin}`, {
    ...init,
    headers: { authorization: `Bearer ${jeton}`, ...(init.headers ?? {}) },
  });

const deposerDiplome = (jeton: string) =>
  candidature(jeton, '/pieces/diplome', {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: new Uint8Array(pngFictif(30, 60, 90)),
  });

Then("le candidat ne peut déposer aucune pièce avant d'accepter la charte", async ({ monde }) => {
  expect((await deposerDiplome(monde.inscription?.jeton ?? '')).status).toBe(409);
});

Then(
  'son dossier de candidature montre la charte acceptée et son diplôme, sans le contenu',
  async ({ monde }) => {
    const r = await candidature(monde.inscription?.jeton ?? '', '');
    expect(r.status).toBe(200);
    const etat = (await r.json()) as {
      practitionerId: string;
      charte: { version: string; acceptee: boolean };
      pieces: Record<string, unknown>[];
    };
    expect(etat.practitionerId).toBe(monde.candidat?.practitionerId);
    expect(etat.charte).toEqual({ version: VERSION_CHARTE_PRO, acceptee: true });
    expect(etat.pieces).toHaveLength(1);
    // Type et date seulement : jamais le contenu de la pièce.
    expect(Object.keys(etat.pieces[0] ?? {}).sort()).toEqual(['deposeLe', 'type']);
    expect(etat.pieces[0]?.['type']).toBe('diplome');
  },
);

Then('le dossier de candidature est refusé à {string}', async ({ monde }, identifiant: string) => {
  const r = await candidature(monde.jetons.get(identifiant) ?? '', '');
  expect(r.status).toBe(403);
});

// Déclaration du candidat (ADR-0026, 3b) : liste fermée, écrite dans la fiche sans période.
const DECLARATION = {
  specialite: 'pediatrie',
  paysOrdre: 'GA',
  numeroOrdre: 'FICTIF-ORDRE-E2E',
  langues: ['fr', 'fan'],
};

const declarer = (jeton: string, corps: object) =>
  candidature(jeton, '/declaration', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corps),
  });

Then(
  'sa fiche porte sa déclaration, toujours inactive et à vérifier, sans période de validité',
  async ({ monde }) => {
    const r = await fetch(
      `${FHIR_URL}/Practitioner/${monde.candidat?.practitionerId ?? 'absente'}`,
      { headers: { 'cache-control': 'no-cache' } },
    );
    expect(r.status).toBe(200);
    const p = (await r.json()) as {
      active?: boolean;
      extension?: { url: string; valueCode?: string }[];
      name?: { family?: string }[];
      qualification?: {
        code: { coding?: { code?: string }[] };
        identifier?: { value?: string }[];
        period?: unknown;
      }[];
      communication?: { coding?: { code?: string }[] }[];
    };
    expect(p.active).toBe(false);
    expect(p.extension?.find((e) => e.url.endsWith('/statut-verification'))?.valueCode).toBe(
      'a-verifier',
    );
    // Le reste de la fiche (nom donné au recruteur) est conservé par la passerelle.
    expect(p.name?.[0]?.family).toBe('Fictif');
    expect(p.qualification?.[0]?.code.coding?.[0]?.code).toBe('pediatrie');
    expect(p.qualification?.[0]?.identifier?.[0]?.value).toBe('FICTIF-ORDRE-E2E');
    expect(p.qualification?.[0]?.period).toBeUndefined();
    expect(p.communication?.map((c) => c.coding?.[0]?.code)).toEqual(['fr', 'fan']);
    const etat = (await (await candidature(monde.inscription?.jeton ?? '', '')).json()) as {
      statut: string;
      declaration: unknown;
    };
    expect(etat.statut).toBe('a-verifier');
    expect(etat.declaration).toEqual(DECLARATION);
  },
);

Then('le candidat ne peut pas déclarer une spécialité hors de la liste', async ({ monde }) => {
  const r = await declarer(monde.inscription?.jeton ?? '', {
    ...DECLARATION,
    specialite: 'Spécialité en texte libre [FICTIF]',
  });
  expect(r.status).toBe(400);
});

// ── Écran « Ma candidature » de l'espace professionnel (ADR-0026, 3c) ───────

const PRO = 'espace professionnel';

const pagePro = (monde: Monde) => {
  const p = monde.visio.get(PRO)?.page;
  if (!p) throw new Error('L’espace professionnel n’est pas ouvert dans ce scénario.');
  return p;
};

When(
  'le candidat ouvre son dossier de candidature dans l’espace professionnel',
  async ({ monde, browser }: { monde: Monde; browser: Browser }) => {
    const { identifiant, motDePasse } = monde.inscription ?? {};
    if (!identifiant || !motDePasse) throw new Error('Aucun candidat inscrit dans ce scénario.');
    const contexte = await browser.newContext();
    const p = await contexte.newPage();
    monde.visio.set(PRO, { contexte, page: p });
    await p.goto(APP_PRO_URL);
    await p.getByRole('button', { name: 'Se connecter' }).click();
    await p.locator('#username').fill(identifiant);
    await p.locator('#password').fill(motDePasse);
    await p.locator('#kc-login').click();
    // Double authentification configurée à l'inscription : code de l'application.
    await p.locator('#otp').fill(await codeUnique(identifiant));
    await p.locator('#kc-login').click();
    // Aucun menu de soignant : seul son dossier, en commençant par la charte.
    await expect(p.getByRole('heading', { name: 'Charte de vérification' })).toBeVisible();
    await expect(p.getByRole('button', { name: /Mes créneaux/ })).toHaveCount(0);
  },
);

When('le candidat accepte la charte dans l’espace professionnel', async ({ monde }) => {
  await pagePro(monde).getByRole('button', { name: 'J’accepte' }).click();
});

When(
  'le candidat déclare sa spécialité, son Ordre et ses langues, et envoie la photo de son diplôme dans l’espace professionnel',
  async ({ monde }) => {
    const p = pagePro(monde);
    await p.getByLabel('Spécialité').selectOption('pediatrie');
    await p.getByLabel(/Pays de l’Ordre/).fill(DECLARATION.paysOrdre);
    await p.getByLabel('Numéro d’inscription à l’Ordre').fill(DECLARATION.numeroOrdre);
    for (const code of DECLARATION.langues) {
      await p.locator(`input[name=langues][value="${code}"]`).check();
    }
    await p.getByRole('button', { name: 'Enregistrer ma déclaration' }).click();
    await expect(p.getByRole('alert')).toHaveText('Déclaration enregistrée.');
    const diplome = p.locator('fieldset[data-piece=diplome]');
    await diplome.locator('input[type=file]').setInputFiles({
      name: 'diplome-fictif.png',
      mimeType: 'image/png',
      buffer: pngFictif(30, 60, 90),
    });
    await diplome.getByRole('button', { name: 'Envoyer' }).click();
    await expect(p.getByRole('alert')).toHaveText('Photo envoyée.');
    await expect(diplome).toContainText('1 photo envoyée');
  },
);

// ── Vérification par une personne habilitée (ADR-0026, étape 4) ───────────────

When(
  'le candidat accepte la charte, déclare son inscription et dépose ses trois pièces',
  async ({ monde }) => {
    const jeton = monde.inscription?.jeton ?? '';
    const charte = await candidature(jeton, '/charte', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: VERSION_CHARTE_PRO, accepte: true }),
    });
    expect(charte.status).toBe(204);
    expect((await declarer(jeton, DECLARATION)).status).toBe(204);
    for (const [type, teinte] of [
      ['diplome', 40],
      ['inscription-ordre', 80],
      ['piece-identite', 120],
    ] as const) {
      const r = await candidature(jeton, `/pieces/${type}`, {
        method: 'POST',
        headers: { 'content-type': 'image/png' },
        body: new Uint8Array(pngFictif(teinte, 60, 90)),
      });
      expect(r.status).toBe(201);
    }
  },
);

const verification = (monde: Monde, identifiant: string, chemin: string, init: RequestInit = {}) =>
  fetch(`${DOCUMENTS_URL}/professionnels/${monde.candidat?.practitionerId ?? 'absente'}${chemin}`, {
    ...init,
    headers: {
      authorization: `Bearer ${monde.jetons.get(identifiant) ?? ''}`,
      ...(init.headers ?? {}),
    },
  });

When(
  '{string} ouvre le dossier du candidat et son diplôme',
  async ({ monde }, identifiant: string) => {
    const r = await verification(monde, identifiant, '');
    expect(r.status).toBe(200);
    const dossier = (await r.json()) as {
      statut: string;
      declaration: { numeroOrdre: string };
      pieces: { id: string; type: string }[];
    };
    expect(dossier.statut).toBe('a-verifier');
    expect(dossier.declaration.numeroOrdre).toBe(DECLARATION.numeroOrdre);
    const diplome = dossier.pieces.find((p) => p.type === 'diplome');
    const photo = await verification(monde, identifiant, `/pieces/${diplome?.id ?? 'absente'}`);
    expect(photo.status).toBe(200);
    expect(photo.headers.get('cache-control')).toBe('no-store');
    expect(photo.headers.get('content-type')).toBe('image/png');
  },
);

Then(
  'chaque consultation est tracée dans le dossier, sur la fiche du candidat',
  async ({ monde }) => {
    const r = await fetch(
      `${FHIR_URL}/AuditEvent?entity=Practitioner/${monde.candidat?.practitionerId ?? 'absente'}`,
      { headers: { 'cache-control': 'no-cache' } },
    );
    expect(r.status).toBe(200);
    const traces =
      (
        (await r.json()) as {
          entry?: { resource: { entity?: { detail?: { valueString?: string }[] }[] } }[];
        }
      ).entry ?? [];
    const objets = traces.map((e) => e.resource.entity?.[0]?.detail?.[0]?.valueString).sort();
    expect(objets).toEqual(['diplome', 'dossier']);
  },
);

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dansUnAn = () => new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

When(
  '{string} vérifie le candidat, les quatre points étant conformes',
  async ({ monde }, identifiant: string) => {
    const r = await verification(monde, identifiant, '/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        resultat: 'verifie',
        controles: ['identite', 'diplome', 'inscription', 'specialite'].map((point) => ({
          point,
          source: 'registre-ordre',
          consulteLe: aujourdhui(),
          conforme: true,
        })),
        validite: { debut: aujourdhui(), fin: dansUnAn() },
      }),
    });
    expect(r.status).toBe(200);
  },
);

Then(
  'la fiche du candidat est active et vérifiée, avec la fin de validité de son inscription',
  async ({ monde }) => {
    const r = await fetch(
      `${FHIR_URL}/Practitioner/${monde.candidat?.practitionerId ?? 'absente'}`,
      { headers: { 'cache-control': 'no-cache' } },
    );
    const p = (await r.json()) as {
      active?: boolean;
      extension?: { url: string; valueCode?: string }[];
      qualification?: { identifier?: { value?: string }[]; period?: { end?: string } }[];
    };
    expect(p.active).toBe(true);
    expect(p.extension?.find((e) => e.url.endsWith('/statut-verification'))?.valueCode).toBe(
      'verifie',
    );
    expect(p.qualification?.[0]?.identifier?.[0]?.value).toBe(DECLARATION.numeroOrdre);
    expect(p.qualification?.[0]?.period?.end).toBe(dansUnAn());
  },
);

Then(
  'le dossier du candidat est refusé à {string} avec le statut {int}',
  async ({ monde }, identifiant: string, statut: number) => {
    expect((await verification(monde, identifiant, '')).status).toBe(statut);
  },
);

// ── Activation à la connexion (ADR-0026, étape 4b) ─────────────────────────────

When(
  'le candidat se reconnecte à l’espace professionnel',
  async ({ monde, browser }: { monde: Monde; browser: Browser }) => {
    const { identifiant, motDePasse } = monde.inscription ?? {};
    if (!identifiant || !motDePasse) throw new Error('Aucun candidat inscrit dans ce scénario.');
    // Nouveau navigateur : aucune session ouverte, la connexion passe par l'extension d'activation.
    const contexte = await browser.newContext();
    const p = await contexte.newPage();
    monde.visio.set(PRO, { contexte, page: p });
    await p.goto(APP_PRO_URL);
    await p.getByRole('button', { name: 'Se connecter' }).click();
    await p.locator('#username').fill(identifiant);
    await p.locator('#password').fill(motDePasse);
    await p.locator('#kc-login').click();
    await p.locator('#otp').fill(await codeUnique(identifiant));
    await p.locator('#kc-login').click();
  },
);

Then(
  'il arrive sur ses rendez-vous, avec le rôle professionnel et sans le rôle d’attente',
  async ({ monde }) => {
    const p = pagePro(monde);
    await expect(p.getByRole('heading', { name: 'Rendez-vous à venir' })).toBeVisible();
    await expect(p.getByRole('button', { name: /Mes créneaux/ })).toBeVisible();
    const jeton = await jetonAdministrateur();
    const admin = (chemin: string) =>
      fetch(`${KEYCLOAK_URL}/admin/realms/${ROYAUME}${chemin}`, {
        headers: { authorization: `Bearer ${jeton}` },
      }).then((r) => r.json());
    const [compte] = (await admin(
      `/users?username=${monde.inscription?.identifiant ?? ''}&exact=true`,
    )) as { id: string }[];
    const roles = (
      (await admin(`/users/${compte?.id ?? ''}/role-mappings/realm`)) as { name: string }[]
    ).map((r) => r.name);
    expect(roles).toContain('professionnel');
    expect(roles).not.toContain('professionnel-candidat');
  },
);
