// Étapes « paiement dans les applications » (ADR-0017) : vrai navigateur sur l'application patient et
// sur l'espace professionnel ; le payeur est simulé. Données FICTIVES uniquement (numéro inventé).
import { expect, type Browser, type Page } from '@playwright/test';
import { APP_PRO_URL, FHIR_URL, PAIEMENT_URL, TELECONSULTATION_URL } from '../configuration.js';
import { Then, When, saisirIdentifiants, type Monde } from './fixtures.js';

const page = (monde: Monde, nom: string): Page => {
  const p = monde.visio.get(nom)?.page;
  if (!p) throw new Error(`L’${nom} n’est pas ouverte dans ce scénario.`);
  return p;
};
const patient = (monde: Monde) => page(monde, 'application patient');
const pro = (monde: Monde) => page(monde, 'espace professionnel');

/** Montant affiché au format du pays (espaces fines insécables comprises). */
const montantAffiche = (valeur: number, devise: string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: devise, maximumFractionDigits: 0 })
    .format(valeur)
    .replace(/\s/g, '\\s');

Then(
  'l’application demande de payer {int} {string}',
  async ({ monde }, montant: number, devise: string) => {
    const p = patient(monde);
    await expect(p.getByRole('heading', { name: 'Payer la consultation' })).toBeVisible();
    await expect(p.locator('[data-montant]')).toHaveText(
      new RegExp(`^${montantAffiche(montant, devise)}$`),
    );
    await expect(p.getByText(/à payer dans les \d+ minutes/)).toBeVisible();
  },
);

When(
  'le patient paie avec {string} depuis le numéro {string} dans l’application',
  async ({ monde }, operateur: string, numero: string) => {
    const p = patient(monde);
    await p.getByLabel(operateur).check();
    await p.getByLabel(/Numéro qui paie/).fill(numero);
    await p.getByRole('button', { name: 'Payer' }).click();
  },
);

Then(
  'l’application demande de valider le paiement sur le téléphone avec {string}',
  async ({ monde }, operateur: string) => {
    await expect(patient(monde).getByRole('status')).toContainText(
      `Validez le paiement sur le téléphone avec votre code secret ${operateur}`,
    );
  },
);

/** Le paiement du rendez-vous réservé sur ce créneau, retrouvé comme le ferait le patient. */
async function paiementDuCreneau(monde: Monde): Promise<string> {
  const creneau = `Slot/${monde.creneaux?.[0] ?? ''}`;
  const r = await fetch(
    `${FHIR_URL}/Appointment?slot=${encodeURIComponent(creneau)}&status=pending`,
    {
      headers: { 'cache-control': 'no-cache' },
    },
  );
  const bundle = (await r.json()) as { entry?: { resource: { id: string } }[] };
  const rendezVousId = bundle.entry?.[0]?.resource.id;
  expect(rendezVousId).toEqual(expect.any(String));
  monde.rendezVousId = rendezVousId ?? '';
  const v = await fetch(`${TELECONSULTATION_URL}/rendez-vous/${monde.rendezVousId}/paiement`, {
    method: 'POST',
    headers: { authorization: `Bearer ${monde.jetons.get('patient-fictif-04') ?? ''}` },
  });
  expect(v.status).toBe(200);
  const id = ((await v.json()) as { paiement?: { id: string } }).paiement?.id ?? '';
  expect(id).not.toBe('');
  return id;
}

async function conclure(monde: Monde, resultat: 'reussi' | 'echoue'): Promise<void> {
  const id = await paiementDuCreneau(monde);
  const r = await fetch(`${PAIEMENT_URL}/simulation/paiements/${id}/conclusion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resultat }),
  });
  expect(r.status).toBe(200);
}

When('le payeur valide sur son téléphone le paiement de ce créneau', async ({ monde }) => {
  await conclure(monde, 'reussi');
});

When('le payeur refuse sur son téléphone le paiement de ce créneau', async ({ monde }) => {
  await conclure(monde, 'echoue');
});

Then('l’application confirme que le rendez-vous est payé', async ({ monde }) => {
  await expect(patient(monde).getByRole('status')).toHaveText(
    'Paiement reçu. Votre rendez-vous est confirmé.',
    { timeout: 15_000 },
  );
});

Then('le rendez-vous payé apparaît dans l’application, prêt à être rejoint', async ({ monde }) => {
  const p = patient(monde);
  await p.getByRole('button', { name: 'Mes rendez-vous' }).click();
  const ligne = p.locator(`li[data-creneau="${monde.creneaux?.[0] ?? ''}"]`);
  await expect(ligne.getByRole('button', { name: 'Rejoindre' })).toBeVisible();
  await expect(ligne).not.toContainText('En attente de paiement');
});

Then(
  'l’application indique que le paiement n’a pas abouti et propose de réessayer',
  async ({ monde }) => {
    const p = patient(monde);
    await expect(p.getByRole('alert')).toHaveText(
      'Le paiement n’a pas abouti. Vous pouvez réessayer.',
      { timeout: 15_000 },
    );
    await expect(p.getByRole('button', { name: 'Payer' })).toBeVisible();
    // Le numéro saisi n'est pas gardé dans le formulaire.
    await expect(p.getByLabel(/Numéro qui paie/)).toHaveValue('');
  },
);

When(
  '{string} ouvre les remboursements à valider dans l’espace professionnel',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const contexte = await browser.newContext();
    const p = await contexte.newPage();
    monde.visio.set('espace professionnel', { contexte, page: p });
    await p.goto(`${APP_PRO_URL}/`);
    await p.getByRole('button', { name: 'Se connecter' }).click();
    await saisirIdentifiants(p, identifiant, true);
    await expect(p.getByRole('heading', { name: 'Remboursements à valider' })).toBeVisible();
  },
);

When('le valideur valide le remboursement de ce rendez-vous', async ({ monde }) => {
  const p = pro(monde);
  // Le remboursement du rendez-vous annulé : identifié par l'API, affiché sans patient ni numéro.
  const r = await fetch(`${PAIEMENT_URL}/remboursements`, {
    headers: { authorization: `Bearer ${monde.jetons.get('valideur-fictif-01') ?? ''}` },
  });
  const liste = ((await r.json()) as { remboursements?: { id: string; reference: string }[] })
    .remboursements;
  const id = liste?.find((x) => x.reference === monde.rendezVousId)?.id ?? '';
  // L'écran a pu être ouvert avant la préparation : il est rechargé par le menu.
  await p.getByRole('button', { name: /Remboursements/ }).click();
  const ligne = p.locator(`li[data-remboursement="${id}"]`);
  await expect(ligne).toContainText('Préparé le');
  await expect(ligne).not.toContainText('+241');
  await ligne.getByRole('button', { name: 'Valider' }).click();
  await ligne.getByRole('button', { name: 'Confirmer le remboursement' }).click();
});

Then('l’espace professionnel confirme que le remboursement est versé', async ({ monde }) => {
  await expect(pro(monde).getByRole('alert')).toHaveText('Remboursement versé.');
});
