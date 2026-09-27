// Étapes « passerelle du dossier » : seul un jeton de service avec la bonne permission ouvre le dossier.
// Données FICTIVES uniquement.
import { expect } from '@playwright/test';
import {
  CLIENT_SERVICE_IDENTITE,
  CLIENT_SERVICE_TELECONSULTATION,
  EMETTEUR,
  PASSERELLE_URL,
} from '../configuration.js';
import { Given, Then, When, type Monde } from './fixtures.js';

/** Comptes de service de test : client Keycloak et variable qui porte son secret (jamais écrit). */
const SERVICES = {
  identité: { client: CLIENT_SERVICE_IDENTITE, variable: 'IDENTITE_SERVICE_CLIENT_SECRET' },
  téléconsultation: {
    client: CLIENT_SERVICE_TELECONSULTATION,
    variable: 'TELECONSULTATION_SERVICE_CLIENT_SECRET',
  },
} as const;
type NomService = keyof typeof SERVICES;

async function jetonService(nom: NomService): Promise<string> {
  const { client, variable } = SERVICES[nom];
  const secret = process.env[variable];
  if (!secret) throw new Error(`${variable} manquant (Keycloak de test).`);
  const r = await fetch(`${EMETTEUR}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: client,
      client_secret: secret,
    }),
  });
  expect(r.status).toBe(200);
  return ((await r.json()) as { access_token: string }).access_token;
}

const JETON_SERVICE = 'service identité';

Given('le service identité a obtenu son jeton de service', async ({ monde }) => {
  monde.jetons.set(JETON_SERVICE, await jetonService('identité'));
});

Given('le service téléconsultation a obtenu son jeton de service', async ({ monde }) => {
  monde.jetons.set('service téléconsultation', await jetonService('téléconsultation'));
});

async function appelerDossier(
  monde: Monde,
  methode: 'GET' | 'DELETE' | 'PUT',
  chemin: string,
  jeton?: string,
  corps?: unknown,
): Promise<void> {
  const r = await fetch(`${PASSERELLE_URL}/fhir/${chemin}`, {
    method: methode,
    headers: {
      accept: 'application/fhir+json',
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
      ...(corps ? { 'content-type': 'application/fhir+json' } : {}),
    },
    ...(corps ? { body: JSON.stringify(corps) } : {}),
  });
  monde.reponse = { statut: r.status, corps: (await r.json()) as Record<string, unknown> };
}

When('une requête sans jeton demande {string} au dossier', async ({ monde }, chemin: string) => {
  await appelerDossier(monde, 'GET', chemin);
});

When(
  'le jeton de {string} est présenté au dossier pour lire {string}',
  async ({ monde }, identifiant: string, chemin: string) => {
    await appelerDossier(monde, 'GET', chemin, monde.jetons.get(identifiant));
  },
);

When('le service identité demande {string} au dossier', async ({ monde }, chemin: string) => {
  await appelerDossier(monde, 'GET', chemin, monde.jetons.get(JETON_SERVICE));
});

When(
  'le service téléconsultation demande {string} au dossier',
  async ({ monde }, chemin: string) => {
    await appelerDossier(monde, 'GET', chemin, monde.jetons.get('service téléconsultation'));
  },
);

When(
  'le service identité tente de supprimer {string} du dossier',
  async ({ monde }, chemin: string) => {
    await appelerDossier(monde, 'DELETE', chemin, monde.jetons.get(JETON_SERVICE));
  },
);

When(
  "le service identité tente de modifier la trace d'accès {string}",
  async ({ monde }, id: string) => {
    await appelerDossier(monde, 'PUT', `AuditEvent/${id}`, monde.jetons.get(JETON_SERVICE), {
      resourceType: 'AuditEvent',
      id,
      outcome: '0',
    });
  },
);

Then('le dossier répond avec le statut {int}', ({ monde }, statut: number) => {
  expect(monde.reponse?.statut).toBe(statut);
  if (statut >= 400) expect(monde.reponse?.corps['resourceType']).toBe('OperationOutcome');
});

Then('le dossier ne renvoie que des consentements', ({ monde }) => {
  const entrees = (monde.reponse?.corps['entry'] ?? []) as { resource: { resourceType: string } }[];
  for (const e of entrees) expect(e.resource.resourceType).toBe('Consent');
});
