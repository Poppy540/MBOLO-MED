// Étapes « paiement » (ADR-0017) : réservation retenue, collecte par mobile money auprès du
// fournisseur simulé, confirmation ou expiration. Données FICTIVES uniquement (numéro inventé).
import { expect } from '@playwright/test';
import { FHIR_URL, PAIEMENT_URL, TELECONSULTATION_URL } from '../configuration.js';
import { Given, Then, When, type Monde } from './fixtures.js';
import { creneauImminent } from './teleconsultation.js';

/** Champs lus d'un Appointment FHIR (sans dépendre des types FHIR dans ce paquet de tests). */
interface Appointment {
  status: string;
  cancelationReason?: { text?: string; coding?: { code?: string }[] };
}

async function appeler(
  monde: Monde,
  base: string,
  methode: 'GET' | 'POST',
  chemin: string,
  jeton: string | undefined,
  corps?: unknown,
): Promise<void> {
  const r = await fetch(`${base}${chemin}`, {
    method: methode,
    headers: {
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
      ...(corps !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
  });
  monde.reponse = { statut: r.status, corps: (await r.json()) as Record<string, unknown> };
}

/** Où en est la réservation, vu par le patient (le service relit le paiement). */
async function verifier(monde: Monde, identifiant: string): Promise<string> {
  await appeler(
    monde,
    TELECONSULTATION_URL,
    'POST',
    `/rendez-vous/${monde.rendezVousId ?? ''}/paiement`,
    monde.jetons.get(identifiant),
  );
  expect(monde.reponse?.statut).toBe(200);
  return String(monde.reponse?.corps['statut']);
}

async function appointment(id: string): Promise<Appointment> {
  const r = await fetch(`${FHIR_URL}/Appointment/${id}`, {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(r.status).toBe(200);
  return (await r.json()) as Appointment;
}

When(
  '{string} réserve un créneau avec {string}',
  async ({ monde }, identifiant: string, praticien: string) => {
    const creneauId = await creneauImminent(praticien);
    monde.creneaux = [creneauId];
    await appeler(
      monde,
      TELECONSULTATION_URL,
      'POST',
      '/rendez-vous',
      monde.jetons.get(identifiant),
      {
        creneauId,
      },
    );
    expect(monde.reponse?.statut).toBe(201);
    monde.rendezVousId = String(monde.reponse?.corps['id']);
    const paiement = monde.reponse?.corps['paiement'] as { id?: string } | undefined;
    if (paiement?.id) monde.paiementId = paiement.id;
  },
);

Then(
  'la réservation attend un paiement de {int} {string}',
  ({ monde }, montant: number, devise: string) => {
    expect(monde.reponse?.corps).toMatchObject({
      statut: 'a-payer',
      paiement: { montant, devise },
    });
    expect(monde.reponse?.corps['expireLe']).toEqual(expect.any(String));
  },
);

Then('{string} ne peut pas encore entrer dans la salle', async ({ monde }, identifiant: string) => {
  await appeler(
    monde,
    TELECONSULTATION_URL,
    'POST',
    `/rendez-vous/${monde.rendezVousId ?? ''}/salle`,
    monde.jetons.get(identifiant),
  );
  expect(monde.reponse?.statut).toBe(409);
});

When(
  '{string} paie avec {string} depuis le numéro {string}',
  async ({ monde }, identifiant: string, operateur: string, numero: string) => {
    await appeler(
      monde,
      PAIEMENT_URL,
      'POST',
      `/paiements/${monde.paiementId ?? ''}/collecte`,
      monde.jetons.get(identifiant),
      { operateur, numero },
    );
  },
);

async function conclure(monde: Monde, resultat: 'reussi' | 'echoue'): Promise<void> {
  expect(monde.reponse?.statut).toBe(202);
  await appeler(
    monde,
    PAIEMENT_URL,
    'POST',
    `/simulation/paiements/${monde.paiementId ?? ''}/conclusion`,
    undefined,
    { resultat },
  );
  expect(monde.reponse?.statut).toBe(200);
}

When('le payeur valide le paiement sur son téléphone', async ({ monde }) => {
  await conclure(monde, 'reussi');
});

When('le payeur refuse le paiement sur son téléphone', async ({ monde }) => {
  await conclure(monde, 'echoue');
});

Then('le rendez-vous de {string} est confirmé', async ({ monde }, identifiant: string) => {
  expect(await verifier(monde, identifiant)).toBe('prevu');
});

Then(
  'le rendez-vous de {string} attend toujours son paiement',
  async ({ monde }, identifiant: string) => {
    expect(await verifier(monde, identifiant)).toBe('a-payer');
  },
);

Given('le délai de paiement est dépassé', async ({ monde }) => {
  // Délai de 15 s en e2e, passage d'expiration toutes les 2 s (playwright.config.ts).
  await expect
    .poll(async () => (await appointment(monde.rendezVousId ?? '')).status, {
      timeout: 40_000,
      intervals: [2_000],
    })
    .toBe('cancelled');
});

Then(
  'le dossier médical contient ce rendez-vous au statut {string}',
  async ({ monde }, statut: string) => {
    expect((await appointment(monde.rendezVousId ?? '')).status).toBe(statut);
  },
);

Then(
  'le dossier médical contient ce rendez-vous au statut {string}, annulé par {string}',
  async ({ monde }, statut: string, auteur: string) => {
    const a = await appointment(monde.rendezVousId ?? '');
    expect(a.status).toBe(statut);
    expect(a.cancelationReason?.coding?.[0]?.code).toBe(auteur);
    expect(a.cancelationReason?.text).toBeUndefined();
  },
);

Then('le paiement est refusé car introuvable pour ce compte', ({ monde }) => {
  expect(monde.reponse?.statut).toBe(404);
});

Then('le rendez-vous est confirmé sans paiement', ({ monde }) => {
  expect(monde.reponse?.corps['statut']).toBe('prevu');
  expect(monde.reponse?.corps['paiement']).toBeUndefined();
  expect(monde.paiementId).toBeUndefined();
});
