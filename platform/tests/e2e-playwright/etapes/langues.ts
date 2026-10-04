// Étapes « langues » (ADR-0025) : choix de la langue sur le premier écran de l'application patient,
// avant toute connexion. Données FICTIVES uniquement.
import { expect, type Browser, type Page } from '@playwright/test';
import { APP_PATIENT_URL, FHIR_URL } from '../configuration.js';
import { Given, Then, When, saisirIdentifiants, type Monde } from './fixtures.js';

const APP = 'application patient';

const page = (monde: Monde): Page => {
  const p = monde.visio.get(APP)?.page;
  if (!p) throw new Error('L’application patient n’est pas ouverte dans ce scénario.');
  return p;
};

Given(
  'l’application patient est ouverte, sans connexion',
  async ({ monde, browser }: { monde: Monde; browser: Browser }) => {
    const contexte = await browser.newContext();
    const p = await contexte.newPage();
    monde.visio.set(APP, { contexte, page: p });
    await p.goto(`${APP_PATIENT_URL}/`);
  },
);

When('le patient choisit la langue {string}', async ({ monde }, nom: string) => {
  const choix = page(monde).getByRole('navigation').getByRole('button', { name: nom });
  await choix.click();
  // Le bouton de la langue choisie est marqué comme enfoncé (lecteurs d'écran).
  await expect(choix).toHaveAttribute('aria-pressed', 'true');
});

When('le patient rouvre l’application', async ({ monde }) => {
  await page(monde).goto(`${APP_PATIENT_URL}/`);
});

Then(
  'l’accueil affiche {string} et la page est en {string}',
  async ({ monde }, bouton: string, langue: string) => {
    const p = page(monde);
    await expect(p.getByRole('button', { name: bouton, exact: true })).toBeVisible();
    // WCAG 3.1.1 : la langue de la page suit le choix, pour que les lecteurs d'écran prononcent bien.
    await expect(p.locator('html')).toHaveAttribute('lang', langue);
  },
);

Then(
  'un texte pas encore traduit reste en français : {string}',
  async ({ monde }, texte: string) => {
    await expect(page(monde).getByRole('button', { name: texte })).toBeVisible();
  },
);

When('{string} se connecte depuis cet écran', async ({ monde }, identifiant: string) => {
  const p = page(monde);
  // Le bouton est dans la langue choisie ; la suite de l'application n'est pas encore traduite.
  await p.getByRole('button', { name: /Se connecter$/ }).click();
  await saisirIdentifiants(p, identifiant, false);
  await expect(p.getByRole('heading', { name: 'Mes rendez-vous' })).toBeVisible();
});

Then(
  'le dossier de {string} indique la langue préférée {string}',
  // eslint-disable-next-line no-empty-pattern -- aucun élément du contexte n'est utilisé
  async ({}, patientId: string, langue: string) => {
    // Lu directement dans le serveur FHIR de test : la langue est écrite après la connexion, sans
    // que l'application attende la réponse.
    const preferee = async () => {
      const r = await fetch(`${FHIR_URL}/Patient/${patientId}`, {
        headers: { 'cache-control': 'no-cache' },
      });
      const p = (await r.json()) as {
        communication?: { preferred?: boolean; language: { coding?: { code?: string }[] } }[];
      };
      return p.communication?.find((c) => c.preferred)?.language.coding?.[0]?.code;
    };
    await expect.poll(preferee, { timeout: 5_000 }).toBe(langue);
  },
);
