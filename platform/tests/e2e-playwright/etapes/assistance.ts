// Étapes « retrait des proches par l'équipe d'assistance » (ADR-0019) : vrai navigateur sur l'espace
// professionnel (rôle assistance-patient, double authentification), service invitations, identite
// et dossier FHIR réels. Données FICTIVES uniquement.
import { expect, type Browser, type Page } from '@playwright/test';
import { APP_PRO_URL, IDENTITE_URL, INVITATIONS_URL, compte } from '../configuration.js';
import { Then, When, saisirIdentifiants, type Monde } from './fixtures.js';

const ESPACE = 'espace d’assistance';

const page = (monde: Monde): Page => {
  const p = monde.visio.get(ESPACE)?.page;
  if (!p) throw new Error('L’espace d’assistance n’est pas ouvert dans ce scénario.');
  return p;
};

When(
  '{string} ouvre l’espace d’assistance',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const contexte = await browser.newContext();
    const p = await contexte.newPage();
    monde.visio.set(ESPACE, { contexte, page: p });
    await p.goto(APP_PRO_URL);
    await p.getByRole('button', { name: 'Se connecter' }).click();
    await saisirIdentifiants(p, identifiant, true);
    await expect(p.getByRole('heading', { name: 'Aider un patient qui appelle' })).toBeVisible();
    // Aucun écran clinique pour ce rôle.
    await expect(p.getByRole('button', { name: /Rendez-vous/ })).toHaveCount(0);
  },
);

When('il retrouve le dossier du numéro d’assurance {string}', async ({ monde }, numero: string) => {
  const p = page(monde);
  await p.getByLabel('Type de numéro').selectOption('assurance-maladie');
  await p.getByLabel('Numéro donné par le patient').fill(numero);
  await p.getByRole('button', { name: 'Retrouver le dossier' }).click();
});

Then(
  'l’espace d’assistance affiche le numéro de rappel {string} et au moins {int} proche(s)',
  async ({ monde }, telephone: string, n: number) => {
    const p = page(monde);
    await expect(p.getByRole('link', { name: telephone })).toBeVisible();
    // Au moins : une base locale peut garder des proches d'exécutions interrompues.
    const nombre = Number(
      await p
        .getByText(/Proches avec un accès/)
        .locator('strong')
        .innerText(),
    );
    expect(nombre).toBeGreaterThanOrEqual(n);
    // Rien d'autre du dossier : ni nom, ni date de naissance, ni prénom des proches.
    await expect(p.locator('main')).not.toContainText('1990');
    await expect(p.locator('main')).not.toContainText('Serge');
  },
);

When(
  'il confirme avoir rappelé le patient et saisit la date de naissance {string}',
  async ({ monde }, naissance: string) => {
    const p = page(monde);
    await p.getByLabel(/J’ai rappelé le patient/).check();
    await p.getByLabel('2. Date de naissance dite par le patient').fill(naissance);
    await p.getByRole('button', { name: 'Retirer tous ses proches' }).click();
  },
);

When('il saisit de nouveau la date de naissance {string}', async ({ monde }, naissance: string) => {
  const p = page(monde);
  await p.getByLabel('2. Date de naissance dite par le patient').fill(naissance);
  await p.getByRole('button', { name: 'Retirer tous ses proches' }).click();
});

Then(
  'l’espace d’assistance ne trouve plus aucun proche pour le numéro d’assurance {string}',
  async ({ monde }, numero: string) => {
    const p = page(monde);
    await p.getByLabel('Numéro donné par le patient').fill(numero);
    await p.getByRole('button', { name: 'Retrouver le dossier' }).click();
    await expect(p.getByText(/Proches avec un accès/).locator('strong')).toHaveText('0');
  },
);

Then('l’espace d’assistance indique {string}', async ({ monde }, texte: string) => {
  await expect(page(monde).getByRole('alert')).toContainText(texte);
});

Then(
  "l'historique des accès de {string} montre l'intervention de l'équipe d'assistance",
  async ({ monde }, identifiant: string) => {
    const patientId = compte(identifiant).attributs['patient_id'] ?? '';
    const r = await fetch(`${IDENTITE_URL}/patients/${patientId}/acces`, {
      headers: { authorization: `Bearer ${monde.jetons.get(identifiant) ?? ''}` },
    });
    expect(r.status).toBe(200);
    const { acces } = (await r.json()) as {
      acces: { motif?: string; autorise: boolean; roles: string[] }[];
    };
    const equipe = acces.filter((a) => a.motif === 'assistance-patient');
    // Recherche, date refusée, retrait : chaque étape est visible par le patient.
    expect(equipe.some((a) => !a.autorise)).toBe(true);
    expect(equipe.filter((a) => a.autorise).length).toBeGreaterThanOrEqual(2);
    expect(equipe.every((a) => a.roles.includes('assistance-patient'))).toBe(true);
  },
);

async function rechercher(monde: Monde, jeton: string | undefined, numero: string) {
  const r = await fetch(`${INVITATIONS_URL}/assistance/recherche`, {
    method: 'POST',
    headers: {
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type: 'assurance-maladie', numero }),
  });
  monde.reponse = {
    statut: r.status,
    corps: (await r.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

When(
  '{string} cherche auprès de l’assistance le dossier du numéro d’assurance {string}',
  async ({ monde }, identifiant: string, numero: string) => {
    const j = monde.jetons.get(identifiant);
    if (!j) throw new Error(`${identifiant} n'est pas connecté dans ce scénario.`);
    await rechercher(monde, j, numero);
  },
);

When(
  'une personne sans jeton cherche auprès de l’assistance le dossier du numéro d’assurance {string}',
  async ({ monde }, numero: string) => {
    await rechercher(monde, undefined, numero);
  },
);

When(
  '{string} demande à identite le retrait des partages avec les proches de {string}',
  async ({ monde }, identifiant: string, patient: string) => {
    const patientId = compte(patient).attributs['patient_id'] ?? '';
    const r = await fetch(`${IDENTITE_URL}/patients/${patientId}/proches/retrait-assistance`, {
      method: 'POST',
      headers: { authorization: `Bearer ${monde.jetons.get(identifiant) ?? ''}` },
    });
    monde.reponse = {
      statut: r.status,
      corps: (await r.json().catch(() => ({}))) as Record<string, unknown>,
    };
  },
);

Then('la demande à l’assistance est refusée avec le statut {int}', ({ monde }, statut: number) => {
  expect(monde.reponse?.statut).toBe(statut);
});

// Rendez-vous à reprendre (ADR-0026, étape 5) : section de l'écran, liste lue sans cache.
Then('l’espace d’assistance montre les rendez-vous à reprendre', async ({ monde }) => {
  const p = page(monde);
  await expect(p.getByRole('heading', { name: 'Rendez-vous à reprendre' })).toBeVisible();
  await expect(p.getByText('Rien n’est annulé automatiquement.', { exact: false })).toBeVisible();
});
