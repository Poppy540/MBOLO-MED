// Étapes « invitation d'un proche » (ADR-0019) : API du service invitations avec le jeton du
// patient, vérifications dans le dossier FHIR de test et la boîte des SMS simulés.
// Données FICTIVES uniquement (numéros manifestement inventés).
import { expect } from '@playwright/test';
import { FHIR_URL, IDENTITE_URL, INVITATIONS_URL, NOTIFICATIONS_URL } from '../configuration.js';
import { jetonService } from './dossier.js';
import { Given, Then, When, type Monde } from './fixtures.js';

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

/** Annule les invitations encore valables et retire les partages avec les proches invités ici. */
async function nettoyer(monde: Monde, identifiant: string): Promise<void> {
  const jeton = monde.jetons.get(identifiant) ?? '';
  await appeler(monde, 'GET', '/proches', jeton);
  expect(monde.reponse?.statut).toBe(200);
  const proches = (monde.reponse?.corps['proches'] ?? []) as { id: string; statut: string }[];
  for (const p of proches.filter((x) => x.statut === 'valide')) {
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
