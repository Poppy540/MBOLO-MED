// Étapes « mes documents » : le patient lit ses comptes-rendus et ses ordonnances, dans l'application
// patient ou par l'API du service consultation. Données FICTIVES uniquement.
import { expect, type Browser, type Page } from '@playwright/test';
import { APP_PATIENT_URL, CONSULTATION_URL } from '../configuration.js';
import { Given, Then, When, saisirIdentifiants, type Monde } from './fixtures.js';

const page = (monde: Monde): Page => {
  const p = monde.visio.get('application patient')?.page;
  if (!p) throw new Error('L’application patient n’est pas ouverte dans ce scénario.');
  return p;
};

async function mesDocuments(
  monde: Monde,
  jeton: string | undefined,
  chemin = '/mes-documents',
): Promise<void> {
  const r = await fetch(`${CONSULTATION_URL}${chemin}`, {
    headers: jeton ? { authorization: `Bearer ${jeton}` } : {},
  });
  monde.reponse = {
    statut: r.status,
    corps: (await r.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

Given(
  '{string} rédige le compte-rendu de ce rendez-vous',
  async ({ monde }, identifiant: string) => {
    // Conclusion unique par exécution : le patient a d'autres comptes-rendus fictifs.
    const marque = Date.now();
    monde.conclusion = `[FICTIF] Repos et hydratation (${marque})`;
    monde.consigne = `[FICTIF] Boire souvent ; revenir si la fièvre dure (${marque})`;
    const r = await fetch(
      `${CONSULTATION_URL}/rendez-vous/${monde.rendezVousId ?? ''}/compte-rendu`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${monde.jetons.get(identifiant) ?? ''}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          motif: '[FICTIF] Fièvre depuis deux jours',
          conclusion: monde.conclusion,
          conduiteATenir: monde.consigne,
        }),
      },
    );
    expect(r.status).toBe(201);
  },
);

When('le patient ouvre ses comptes-rendus et ordonnances', async ({ monde }) => {
  const p = page(monde);
  // Depuis l'écran des documents, on revient d'abord aux rendez-vous : la liste est relue.
  const titre = p.getByRole('heading', { name: 'Mes comptes-rendus et ordonnances' });
  if (await titre.isVisible()) await p.getByRole('button', { name: 'Retour' }).click();
  await p.getByRole('button', { name: 'Mes comptes-rendus et ordonnances' }).click();
  await expect(titre).toBeVisible();
});

Then('l’application affiche ce compte-rendu, tel que le médecin l’a écrit', async ({ monde }) => {
  const c = page(monde).locator('li[data-compte-rendu]', { hasText: monde.conclusion ?? 'absent' });
  await expect(c).toHaveCount(1);
  await expect(c).toContainText('Motif : [FICTIF] Fièvre depuis deux jours');
  await expect(c).toContainText(`Conclusion : ${monde.conclusion ?? ''}`);
  await expect(c).toContainText(`Ce qu’il faut faire : ${monde.consigne ?? ''}`);
});

const ordonnance = (monde: Monde) =>
  page(monde).locator(`li[data-ordonnance="${monde.ordonnance ?? 'absente'}"]`);

Then('l’application affiche cette ordonnance, valable', async ({ monde }) => {
  const o = ordonnance(monde);
  await expect(o).toHaveAttribute('data-statut', 'active');
  await expect(o).toContainText('paracétamol');
  await expect(o).toContainText('500 mg, 3 fois par jour, pendant 5 jours');
  await expect(o).toContainText('Valable jusqu’au');
});

Then('l’application indique que cette ordonnance est annulée par le médecin', async ({ monde }) => {
  const o = ordonnance(monde);
  await expect(o).toHaveAttribute('data-statut', 'revoquee');
  await expect(o).toContainText('Annulée par le médecin : ne pas l’utiliser.');
});

When(
  '{string} demande ses comptes-rendus et ordonnances',
  async ({ monde }, identifiant: string) => {
    await mesDocuments(monde, monde.jetons.get(identifiant));
  },
);

When('une personne sans jeton demande des comptes-rendus et ordonnances', async ({ monde }) => {
  await mesDocuments(monde, undefined);
});

Then('ses documents lui sont remis', ({ monde }) => {
  expect(monde.reponse?.statut).toBe(200);
  expect(Array.isArray(monde.reponse?.corps['comptesRendus'])).toBe(true);
  expect(Array.isArray(monde.reponse?.corps['ordonnances'])).toBe(true);
});

Then('la lecture des documents est refusée', ({ monde }) => {
  expect([401, 403]).toContain(monde.reponse?.statut);
  expect(monde.reponse?.corps['comptesRendus']).toBeUndefined();
});

Then("l'historique contient une lecture du patient lui-même", ({ monde }) => {
  expect(monde.reponse?.statut).toBe(200);
  const acces = (monde.reponse?.corps['acces'] ?? []) as Record<string, unknown>[];
  expect(acces).toContainEqual(
    expect.objectContaining({ autorise: true, motif: 'patient-lui-meme', roles: ['patient'] }),
  );
});

// ── Proche désigné par le patient (C-PROCHE, flag documents.proche) ─────────────

When(
  '{string} ouvre l’application patient en tant que proche',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const contexte = await browser.newContext();
    const p = await contexte.newPage();
    monde.visio.set('application patient', { contexte, page: p });
    await p.goto(`${APP_PATIENT_URL}/`);
    await p.getByRole('button', { name: 'Se connecter' }).click();
    // Double authentification obligatoire pour un proche (ADR-0019).
    await saisirIdentifiants(p, identifiant, true);
    await expect(
      p.getByRole('heading', { name: 'Ordonnances et consignes de votre proche' }),
    ).toBeVisible();
  },
);

Then(
  'l’application du proche affiche cette ordonnance et la consigne du médecin',
  async ({ monde }) => {
    const o = ordonnance(monde);
    await expect(o).toHaveAttribute('data-statut', 'active');
    await expect(o).toContainText('500 mg, 3 fois par jour, pendant 5 jours');
    const c = page(monde).locator('li[data-compte-rendu]', { hasText: monde.consigne ?? 'absent' });
    await expect(c).toHaveCount(1);
    await expect(c).toContainText(`Ce qu’il faut faire : ${monde.consigne ?? ''}`);
  },
);

Then('l’application du proche n’affiche ni le motif ni la conclusion', async ({ monde }) => {
  const p = page(monde);
  await expect(p.getByText(monde.conclusion ?? 'absent')).toHaveCount(0);
  await expect(p.getByText('Fièvre depuis deux jours')).toHaveCount(0);
  await expect(p.getByText('Motif :')).toHaveCount(0);
  await expect(p.getByText('Conclusion :')).toHaveCount(0);
});

When(
  '{string} demande les documents partagés par son proche',
  async ({ monde }, identifiant: string) => {
    await mesDocuments(monde, monde.jetons.get(identifiant), '/proche/documents');
  },
);

Then('les documents partagés lui sont remis, sans motif ni conclusion', ({ monde }) => {
  expect(monde.reponse?.statut).toBe(200);
  const comptesRendus = monde.reponse?.corps['comptesRendus'] as {
    sections: Record<string, string>;
  }[];
  expect(Array.isArray(monde.reponse?.corps['ordonnances'])).toBe(true);
  for (const c of comptesRendus) expect(Object.keys(c.sections)).toEqual(['conduite-a-tenir']);
});

Then("l'historique contient une lecture par le proche désigné", ({ monde }) => {
  expect(monde.reponse?.statut).toBe(200);
  const acces = (monde.reponse?.corps['acces'] ?? []) as Record<string, unknown>[];
  expect(acces).toContainEqual(
    expect.objectContaining({ autorise: true, motif: 'consentement-proche', roles: ['proche'] }),
  );
});
