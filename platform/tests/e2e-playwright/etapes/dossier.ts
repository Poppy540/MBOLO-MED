// Étapes « passerelle du dossier » : seul un jeton de service avec la bonne permission ouvre le dossier.
// Données FICTIVES uniquement.
import { expect } from '@playwright/test';
import { creerFournisseurJeton } from '@mbolo/identite';
import {
  CLIENT_SERVICE_IDENTITE,
  CLIENT_SERVICE_NOTIFICATIONS,
  CLIENT_SERVICE_TELECONSULTATION,
  EMETTEUR,
  PASSERELLE_URL,
} from '../configuration.js';
import { Given, Then, When, type Monde } from './fixtures.js';

/**
 * Comptes de service de test : client Keycloak et variable qui porte sa clé privée (jamais écrite),
 * comme les vrais services (private_key_jwt, ADR-0016).
 */
const SERVICES = {
  identité: { client: CLIENT_SERVICE_IDENTITE, variable: 'IDENTITE_SERVICE_CLE_PRIVEE' },
  téléconsultation: {
    client: CLIENT_SERVICE_TELECONSULTATION,
    variable: 'TELECONSULTATION_SERVICE_CLE_PRIVEE',
  },
  notifications: {
    client: CLIENT_SERVICE_NOTIFICATIONS,
    variable: 'NOTIFICATIONS_SERVICE_CLE_PRIVEE',
  },
} as const;
type NomService = keyof typeof SERVICES;

export async function jetonService(nom: NomService): Promise<string> {
  const { client, variable } = SERVICES[nom];
  const clePrivee = process.env[variable];
  if (!clePrivee) throw new Error(`${variable} manquant (Keycloak de test).`);
  const entetes = await creerFournisseurJeton({
    emetteur: EMETTEUR,
    client,
    authentification: { clePrivee },
  })();
  const jeton = entetes['authorization']?.replace(/^Bearer /, '') ?? '';
  expect(jeton).not.toBe('');
  return jeton;
}

const JETON_SERVICE = 'service identité';

// ── Authentification des services auprès de Keycloak (ADR-0016) ──────────────
const CLIENT_DOCUMENTS = 'mbolo-documents-service';
let refusKeycloak: number | undefined;

When('le service documents demande un jeton avec un secret', async () => {
  // Secret fictif construit à l'exécution : seul le mode d'authentification est testé.
  const r = await fetch(`${EMETTEUR}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_DOCUMENTS,
      client_secret: ['secret', 'fictif', 'e2e'].join('-'),
    }),
  });
  refusKeycloak = r.status;
});

When('le service documents signe sa demande de jeton avec la clé du service identité', async () => {
  const autre = process.env['IDENTITE_SERVICE_CLE_PRIVEE'];
  if (!autre) throw new Error('IDENTITE_SERVICE_CLE_PRIVEE manquant (Keycloak de test).');
  refusKeycloak = await creerFournisseurJeton({
    emetteur: EMETTEUR,
    client: CLIENT_DOCUMENTS,
    authentification: { clePrivee: autre },
  })().then(
    () => 200,
    () => 401,
  );
});

Then('Keycloak refuse de lui délivrer un jeton', () => {
  expect(refusKeycloak).toBeGreaterThanOrEqual(400);
  refusKeycloak = undefined;
});

Given('le service identité a obtenu son jeton de service', async ({ monde }) => {
  monde.jetons.set(JETON_SERVICE, await jetonService('identité'));
});

Given('le service téléconsultation a obtenu son jeton de service', async ({ monde }) => {
  monde.jetons.set('service téléconsultation', await jetonService('téléconsultation'));
});

Given('le service notifications a obtenu son jeton de service', async ({ monde }) => {
  monde.jetons.set('service notifications', await jetonService('notifications'));
});

When('le service notifications demande {string} au dossier', async ({ monde }, chemin: string) => {
  await appelerDossier(monde, 'GET', chemin, monde.jetons.get('service notifications'));
});

Then('le dossier ne renvoie que le numéro de téléphone et la langue', ({ monde }) => {
  const corps = monde.reponse?.corps ?? {};
  expect(corps['telecom']).toBeDefined();
  // Langue préférée du patient (ADR-0025), pour écrire ses SMS dans sa langue.
  expect(JSON.stringify(corps['communication'])).toContain('urn:ietf:bcp:47');
  // Ni nom, ni date de naissance, ni autre élément que type, identifiant et métadonnées.
  expect(Object.keys(corps).sort()).toEqual(
    ['communication', 'id', 'meta', 'resourceType', 'telecom'].filter((k) => k in corps).sort(),
  );
  expect(corps['name']).toBeUndefined();
});

Then("le dossier ne renvoie que le statut de vérification d'identité", ({ monde }) => {
  const corps = monde.reponse?.corps ?? {};
  expect(JSON.stringify(corps['extension'])).toContain('statut-identite');
  // Ni nom, ni naissance, ni téléphone, ni numéro d'assurance (ADR-0014, minimisation).
  expect(Object.keys(corps).sort()).toEqual(
    ['extension', 'id', 'meta', 'resourceType'].filter((k) => k in corps).sort(),
  );
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
