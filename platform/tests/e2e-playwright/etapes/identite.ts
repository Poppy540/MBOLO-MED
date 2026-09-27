// Étapes des scénarios « identité et accès au dossier ». Données FICTIVES uniquement.
import { expect } from '@playwright/test';
import { APPLICATIONS, EMETTEUR, IDENTITE_URL, compte, motDePasse } from '../configuration.js';
import { Given, Then, When, autoriser, connecter, revendications, type Monde } from './fixtures.js';

const jeton = (monde: Monde, identifiant: string): string => {
  const j = monde.jetons.get(identifiant);
  if (!j) throw new Error(`${identifiant} n'est pas connecté dans ce scénario.`);
  return j;
};

async function appeler(
  monde: Monde,
  methode: 'GET' | 'POST',
  chemin: string,
  options: { jeton?: string; corps?: unknown } = {},
): Promise<void> {
  const r = await fetch(`${IDENTITE_URL}${chemin}`, {
    method: methode,
    headers: {
      ...(options.jeton ? { authorization: `Bearer ${options.jeton}` } : {}),
      ...(options.corps !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(options.corps !== undefined ? { body: JSON.stringify(options.corps) } : {}),
  });
  monde.reponse = { statut: r.status, corps: (await r.json()) as Record<string, unknown> };
}

const patientId = (identifiant: string): string => {
  const id = compte(identifiant).attributs['patient_id'];
  if (!id) throw new Error(`${identifiant} n'est pas un patient.`);
  return id;
};

// ── Connexion ────────────────────────────────────────────────────────────────

Given('{string} est connecté', async ({ page, monde }, identifiant: string) => {
  monde.jetons.set(identifiant, await connecter(page, identifiant));
});

Then(
  'le jeton de {string} le rattache au dossier {string}',
  async ({ page }, identifiant: string, dossier: string) => {
    // Nouvelle connexion : la valeur vient de Keycloak, pas d'un jeton mis en cache.
    const r = revendications(await connecter(page, identifiant));
    expect(r['iss']).toBe(EMETTEUR);
    expect(r['aud']).toContain('mbolo-identite-api');
    expect(r['patient_id']).toBe(dossier);
  },
);

When(
  "l'application {string} demande une connexion sans PKCE",
  async ({ page, monde }, application: string) => {
    if (application !== 'patient' && application !== 'pro') throw new Error(application);
    const { code, erreur } = await autoriser(page, application, { pkce: false });
    monde.reponse = { statut: code ? 200 : 400, corps: { error: erreur } };
  },
);

When(
  '{string} tente une connexion directe par mot de passe',
  async ({ monde }, identifiant: string) => {
    // Flux « Resource Owner Password » : désactivé sur les applications Mbolo. Le vrai mot de passe
    // est utilisé, pour que seul le réglage du client puisse expliquer le refus.
    const r = await fetch(`${EMETTEUR}/protocol/openid-connect/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: APPLICATIONS[compte(identifiant).application].clientId,
        username: identifiant,
        password: motDePasse(identifiant),
      }),
    });
    monde.reponse = { statut: r.status, corps: (await r.json()) as Record<string, unknown> };
  },
);

Then("Keycloak refuse la connexion avec l'erreur {string}", ({ monde }, erreur: string) => {
  expect(monde.reponse?.statut).toBeGreaterThanOrEqual(400);
  expect(monde.reponse?.corps['error']).toBe(erreur);
});

When(
  '{string} tente de modifier lui-même son identifiant de dossier en {string}',
  async ({ monde }, identifiant: string, autre: string) => {
    const entetes = {
      authorization: `Bearer ${jeton(monde, identifiant)}`,
      accept: 'application/json',
      'content-type': 'application/json',
    };
    const url = `${EMETTEUR}/account/`;
    const profil = (await (await fetch(url, { headers: entetes })).json()) as {
      attributes?: Record<string, string[]>;
    };
    const r = await fetch(url, {
      method: 'POST',
      headers: entetes,
      body: JSON.stringify({
        ...profil,
        attributes: { ...profil.attributes, patient_id: [autre] },
      }),
    });
    monde.reponse = { statut: r.status, corps: (await r.json()) as Record<string, unknown> };
  },
);

Then('la modification est refusée', ({ monde }) => {
  expect(monde.reponse?.statut).toBe(400);
  expect(JSON.stringify(monde.reponse?.corps)).toContain('error-user-attribute-read-only');
});

// ── Accès au dossier ─────────────────────────────────────────────────────────

When(
  "{string} demande l'accès au dossier {string}",
  async ({ monde }, identifiant: string, dossier: string) => {
    await appeler(monde, 'POST', '/acces/dossier', {
      jeton: jeton(monde, identifiant),
      corps: { patientId: dossier },
    });
  },
);

When(
  "{string} demande l'accès au dossier {string} en urgence avec le motif {string}",
  async ({ monde }, identifiant: string, dossier: string, motif: string) => {
    await appeler(monde, 'POST', '/acces/dossier', {
      jeton: jeton(monde, identifiant),
      corps: { patientId: dossier, brisDeGlace: { motif } },
    });
  },
);

When(
  "une demande d'accès au dossier {string} arrive sans jeton",
  async ({ monde }, dossier: string) => {
    await appeler(monde, 'POST', '/acces/dossier', { corps: { patientId: dossier } });
  },
);

When(
  "une demande d'accès au dossier {string} arrive avec le jeton altéré de {string}",
  async ({ monde }, dossier: string, identifiant: string) => {
    const [entete, , signature] = jeton(monde, identifiant).split('.');
    const faux = Buffer.from(
      JSON.stringify({ ...revendications(jeton(monde, identifiant)), patient_id: dossier }),
    ).toString('base64url');
    await appeler(monde, 'POST', '/acces/dossier', {
      jeton: `${entete}.${faux}.${signature}`,
      corps: { patientId: dossier },
    });
  },
);

Then("l'accès est accordé avec le motif {string}", ({ monde }, motif: string) => {
  expect(monde.reponse?.statut).toBe(200);
  expect(monde.reponse?.corps).toMatchObject({ autorise: true, motif });
});

Then("l'accès est refusé avec le motif {string}", ({ monde }, motif: string) => {
  expect(monde.reponse?.statut).toBe(200);
  expect(monde.reponse?.corps).toMatchObject({ autorise: false, motif });
});

Then('une revue humaine est demandée', ({ monde }) => {
  expect(monde.reponse?.corps['audit']).toBe('alerte');
});

Then("aucune revue humaine n'est demandée", ({ monde }) => {
  expect(monde.reponse?.corps['audit']).toBe('normal');
});

Then("la demande est rejetée faute d'authentification", ({ monde }) => {
  expect(monde.reponse?.statut).toBe(401);
});

// ── Consentements ────────────────────────────────────────────────────────────

When(
  '{string} donne son consentement {string} à {string}',
  async ({ monde }, identifiant: string, categorie: string, beneficiaire: string) => {
    await appeler(monde, 'POST', `/patients/${patientId(identifiant)}/consentements`, {
      jeton: jeton(monde, identifiant),
      corps: {
        categorie,
        mode: 'texte',
        versionTexte: 'consentement-v0-FICTIF',
        accepte: true,
        beneficiaire,
      },
    });
    expect(monde.reponse?.statut).toBe(201);
    monde.consentementId = String(monde.reponse?.corps['id']);
  },
);

When('{string} retire ce consentement', async ({ monde }, identifiant: string) => {
  await appeler(monde, 'POST', `/consentements/${monde.consentementId ?? ''}/revocation`, {
    jeton: jeton(monde, identifiant),
  });
  expect(monde.reponse?.statut).toBe(200);
  expect(monde.reponse?.corps['status']).toBe('inactive');
});

When(
  '{string} tente de lire les consentements du dossier {string}',
  async ({ monde }, identifiant: string, dossier: string) => {
    await appeler(monde, 'GET', `/patients/${dossier}/consentements`, {
      jeton: jeton(monde, identifiant),
    });
  },
);

Then('la demande est interdite', ({ monde }) => {
  expect(monde.reponse?.statut).toBe(403);
});
