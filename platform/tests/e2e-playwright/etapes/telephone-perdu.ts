// Étapes « téléphone perdu » (ADR-0023, parcours 2) : action Keycloak lancée depuis l'application,
// code reçu au nouveau numéro, nouvelles photos, décision d'une personne habilitée (par l'API ; son
// écran arrive avec la PR suivante). Données FICTIVES uniquement.
import { expect, type Page } from '@playwright/test';
import { EXTENSION_CHANGEMENT_TELEPHONE } from '@mbolo/dossier-fhir';
import { DOCUMENTS_URL, FHIR_URL, IDENTITE_URL, compte } from '../configuration.js';
import { pngFictif } from './documents.js';
import { Given, Then, When, type Monde } from './fixtures.js';
import { codeSmsRecu } from './niveau.js';

const APP = 'application patient';

const page = (monde: Monde): Page => {
  const p = monde.visio.get(APP)?.page;
  if (!p) throw new Error('L’application patient n’est pas ouverte dans ce scénario.');
  return p;
};

const patientId = (identifiant: string): string => {
  const id = compte(identifiant).attributs['patient_id'];
  if (!id) throw new Error(`${identifiant} n'est pas un patient.`);
  return id;
};

const jeton = (monde: Monde, identifiant: string): string => {
  const j = monde.jetons.get(identifiant);
  if (!j) throw new Error(`${identifiant} n'est pas connecté dans ce scénario.`);
  return j;
};

/** Numéro du dossier, lu directement dans le serveur FHIR (sans cache). */
async function numero(identifiant: string) {
  const r = await fetch(`${FHIR_URL}/Patient/${patientId(identifiant)}`, {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(r.status).toBe(200);
  const p = (await r.json()) as {
    telecom?: {
      value?: string;
      extension?: { url: string; valueCode?: string }[];
      period?: { start?: string };
    }[];
  };
  return p.telecom?.[0];
}

Given(
  '{string} a accepté la charte de vérification d’identité à l’inscription',
  async ({ monde }, identifiant: string) => {
    // Un patient vérifié l'a acceptée pour ses premières photos ; elle vaut pour les nouvelles.
    const r = await fetch(`${IDENTITE_URL}/patients/${patientId(identifiant)}/consentements`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jeton(monde, identifiant)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        categorie: 'C-IDENTITE',
        mode: 'texte',
        versionTexte: '0.1',
        accepte: true,
      }),
    });
    expect(r.status).toBe(201);
  },
);

When(
  'le patient choisit « J’ai perdu mon téléphone » et confirme le nouveau numéro {string}',
  async ({ monde }, nouveau: string) => {
    const p = page(monde);
    await p.getByRole('button', { name: 'Changer mon numéro' }).click();
    await p.getByRole('button', { name: 'J’ai perdu mon téléphone' }).click();
    // Keycloak : le nouveau numéro, puis le code reçu à ce numéro (jamais à l'ancien).
    await expect(p.locator('body')).toContainText("J'ai perdu mon téléphone");
    await p.locator('#telephone').fill(nouveau);
    monde.depuis = new Date().toISOString();
    await p.locator('#kc-submit').click();
    await expect(p.locator('body')).toContainText(`envoyé par SMS au ${nouveau}`);
    await p.locator('#code_sms').fill(await codeSmsRecu(nouveau, monde.depuis));
    await p.locator('#kc-submit').click();
    // Retour dans l'application : la demande est enregistrée, place aux photos.
    await expect(p.getByRole('alert')).toHaveText(
      'Demande enregistrée. Envoyez maintenant deux nouvelles photos.',
    );
    await expect(p.getByRole('heading', { name: 'Vos deux nouvelles photos' })).toBeVisible();
  },
);

When('il envoie deux nouvelles photos depuis l’application', async ({ monde }) => {
  const p = page(monde);
  await p.locator('#photo-document').setInputFiles({
    name: 'document.png',
    mimeType: 'image/png',
    buffer: pngFictif(40, 90, 160),
  });
  await p.getByRole('button', { name: 'Envoyer la photo du document' }).click();
  await expect(p.getByRole('listitem').filter({ hasText: 'Votre document' })).toContainText(
    'est envoyé',
  );
  await p.locator('#photo-visage').setInputFiles({
    name: 'visage.png',
    mimeType: 'image/png',
    buffer: pngFictif(200, 150, 120),
  });
  await p.getByRole('button', { name: 'Envoyer la photo du visage' }).click();
  await expect(p.locator('section')).toContainText(
    'va vérifier vos photos avant de changer votre numéro',
  );
});

When(
  '{string} décide {string} sur la demande de changement de numéro de {string}',
  async ({ monde }, verificateur: string, decision: string, identifiant: string) => {
    const entetes = { authorization: `Bearer ${jeton(monde, verificateur)}` };
    // La fiche (tracée dans le dossier) montre les deux nouvelles photos.
    const fiche = await fetch(`${DOCUMENTS_URL}/demandes-perte/${patientId(identifiant)}`, {
      headers: entetes,
    });
    expect(fiche.status).toBe(200);
    expect(((await fiche.json()) as { nouvelles: unknown[] }).nouvelles).toHaveLength(2);
    monde.depuis = new Date().toISOString();
    const r = await fetch(`${DOCUMENTS_URL}/demandes-perte/${patientId(identifiant)}/decision`, {
      method: 'POST',
      headers: { ...entetes, 'content-type': 'application/json' },
      body: JSON.stringify(
        decision === 'acceptee'
          ? { resultat: 'acceptee' }
          : { resultat: 'refusee', motif: 'visage-different' },
      ),
    });
    expect(r.status).toBe(201);
  },
);

Then(
  'le dossier de {string} porte encore le numéro {string}',
  // eslint-disable-next-line no-empty-pattern -- aucun élément du contexte n'est utilisé
  async ({}, identifiant: string, telephone: string) => {
    expect((await numero(identifiant))?.value).toBe(telephone);
  },
);

Then(
  'le dossier de {string} porte le numéro {string}, changé après une perte',
  // eslint-disable-next-line no-empty-pattern -- aucun élément du contexte n'est utilisé
  async ({}, identifiant: string, telephone: string) => {
    const n = await numero(identifiant);
    expect(n?.value).toBe(telephone);
    expect(n?.extension).toEqual([{ url: EXTENSION_CHANGEMENT_TELEPHONE, valueCode: 'perte' }]);
    expect(Date.now() - new Date(n?.period?.start ?? 0).getTime()).toBeLessThan(600_000);
  },
);
