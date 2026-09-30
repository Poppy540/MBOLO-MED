// Étapes « changement du numéro du dossier » (ADR-0023) : action Keycloak lancée par l'application
// (`kc_action`), codes lus dans la boîte SMS simulée. Données FICTIVES uniquement.
import { expect, type Page, type Request } from '@playwright/test';
import { EXTENSION_CHANGEMENT_TELEPHONE } from '@mbolo/dossier-fhir';
import { APP_PATIENT_URL, APPLICATIONS, FHIR_URL } from '../configuration.js';
import { Given, Then, When, revendications, urlAutorisation, type Monde } from './fixtures.js';
import { codeSmsRecu } from './niveau.js';

/** Numéro saisi par la personne inscrite dans les scénarios (`IDENTITE_FICTIVE`, invitations.ts). */
const ANCIEN = '+241 00 00 00 04';

const retours = new WeakMap<Monde, { url?: URL }>();

const page = (monde: Monde): Page => {
  const p = monde.inscription?.page;
  if (!p) throw new Error('Aucune personne inscrite dans ce scénario.');
  return p;
};

When('la personne inscrite demande à changer son numéro', async ({ monde }) => {
  const p = page(monde);
  const retour: { url?: URL } = {};
  retours.set(monde, retour);
  p.on('request', (r: Request) => {
    if (r.url().startsWith(APPLICATIONS.patient.redirection)) retour.url = new URL(r.url());
  });
  // Action lancée par l'application : même session Keycloak que l'inscription.
  await p.goto(`${urlAutorisation('patient', true).url}&kc_action=mbolo-changer-telephone`);
  // Session fermée après l'inscription : le patient se connecte d'abord avec son mot de passe.
  if (await p.locator('#username').count()) {
    await p.locator('#username').fill(monde.inscription?.identifiant ?? '');
    await p.locator('#password').fill(monde.inscription?.motDePasse ?? '');
    await p.locator('#kc-login').click();
    await p.waitForLoadState();
  }
});

When(
  'la personne inscrite choisit « Changer mon numéro » dans l’application',
  async ({ monde }) => {
    const p = page(monde);
    await p.goto(`${APP_PATIENT_URL}/`);
    await p.getByRole('button', { name: 'Se connecter' }).click();
    await p.locator('#username').fill(monde.inscription?.identifiant ?? '');
    await p.locator('#password').fill(monde.inscription?.motDePasse ?? '');
    await p.locator('#kc-login').click();
    // Identité pas encore vérifiée : l'écran « compte créé » propose aussi de changer de numéro.
    await p.getByRole('button', { name: 'Changer mon numéro' }).click();
    await expect(p.locator('[data-changer-numero]')).toContainText(
      'Il vous faut vos deux téléphones',
    );
    await p.getByRole('button', { name: 'Recevoir le code' }).click();
  },
);

Then('l’application patient affiche le message {string}', async ({ monde }, texte: string) => {
  await expect(page(monde).getByRole('alert')).toHaveText(texte);
});

When(
  'elle confirme avec le code reçu à son ancien numéro, puis indique le nouveau numéro {string}',
  async ({ monde }, nouveau: string) => {
    const p = page(monde);
    await expect(p.locator('#code_sms')).toBeVisible();
    await p.locator('#code_sms').fill(await codeSmsRecu(ANCIEN, monde.depuis ?? ''));
    await p.locator('#kc-submit').click();
    await expect(p.locator('#kc-changer-telephone-form #telephone')).toBeVisible();
    await p.locator('#telephone').fill(nouveau);
    monde.depuis = new Date().toISOString();
    await p.locator('#kc-submit').click();
    await expect(p.locator('body')).toContainText(`envoyé par SMS au ${nouveau}`);
  },
);

When(
  'elle confirme avec le code reçu au nouveau numéro {string}',
  async ({ monde }, nouveau: string) => {
    const p = page(monde);
    await p.locator('#code_sms').fill(await codeSmsRecu(nouveau, monde.depuis ?? ''));
    await p.locator('#kc-submit').click();
  },
);

When('elle renonce au changement de numéro', async ({ monde }) => {
  const p = page(monde);
  await expect(p.locator('#code_sms')).toBeVisible();
  await p.locator('#kc-annuler').click();
});

Then('l’application apprend que le numéro est {string}', async ({ monde }, statut: string) => {
  // Keycloak revient vers l'application avec le résultat de l'action.
  const retour = retours.get(monde);
  await expect.poll(() => retour?.url, { timeout: 10_000 }).toBeDefined();
  const attendu = { changé: 'success', inchangé: 'cancelled' }[statut] ?? statut;
  expect(retour?.url?.searchParams.get('kc_action_status')).toBe(attendu);
});

Then('Keycloak refuse un second changement de numéro le même jour', async ({ monde }) => {
  await expect(page(monde).locator('body')).toContainText(
    'Vous avez déjà changé de numéro il y a moins de 24 heures.',
  );
});

/** Éléments du dossier lus par ces étapes. */
interface Patient {
  id?: string;
  telecom?: {
    value?: string;
    extension?: { url: string; valueCode?: string }[];
    period?: { start?: string };
  }[];
}

/** Dossier de la personne inscrite, lu directement dans le serveur FHIR (sans cache). */
async function dossier(monde: Monde): Promise<Patient> {
  const patientId = String(revendications(monde.inscription?.jeton ?? '')['patient_id']);
  const r = await fetch(`${FHIR_URL}/Patient/${patientId}`, {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(r.status).toBe(200);
  return (await r.json()) as Patient;
}

Given(
  'le numéro de son dossier a été changé après une perte il y a {int} heures',
  async ({ monde }, heures: number) => {
    // Préparation : ce que fera la décision d'une personne habilitée (ADR-0023, parcours « perte »).
    const p = await dossier(monde);
    const le = new Date(Date.now() - heures * 3_600_000);
    le.setUTCMilliseconds(0);
    const telecom = (p.telecom ?? []).map((t) => ({
      ...t,
      extension: [{ url: EXTENSION_CHANGEMENT_TELEPHONE, valueCode: 'perte' }],
      period: { start: le.toISOString() },
    }));
    const r = await fetch(`${FHIR_URL}/Patient/${p.id ?? ''}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/fhir+json' },
      body: JSON.stringify({ ...p, telecom }),
    });
    expect(r.status).toBe(200);
    monde.depuis = new Date().toISOString();
  },
);

Then('Keycloak explique qu’aucun code n’est envoyé pendant 24 heures', async ({ monde }) => {
  await expect(page(monde).locator('body')).toContainText(
    "Par sécurité, aucun code n'est envoyé pendant 24 heures après ce changement.",
  );
});

Then('un code arrive au numéro {string}', async ({ monde }, telephone: string) => {
  expect(await codeSmsRecu(telephone, monde.depuis ?? '')).toMatch(/^[0-9]{6}$/);
});

Then('son dossier note un changement de numéro fait par le patient', async ({ monde }) => {
  const [numero] = (await dossier(monde)).telecom ?? [];
  expect(numero?.extension).toEqual([
    { url: EXTENSION_CHANGEMENT_TELEPHONE, valueCode: 'patient' },
  ]);
  expect(Date.now() - new Date(numero?.period?.start ?? 0).getTime()).toBeLessThan(600_000);
});
