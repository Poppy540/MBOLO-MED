// Étapes « accès sur invitation » (ADR-0013). Données FICTIVES uniquement.
import { expect } from '@playwright/test';
import { COHORTE_TEST, INVITATIONS_URL } from '../configuration.js';
import { Then, When, type Monde } from './fixtures.js';

async function appeler(
  monde: Monde,
  methode: 'GET' | 'POST',
  chemin: string,
  options: { identifiant?: string; corps?: unknown } = {},
): Promise<void> {
  const jeton = options.identifiant ? monde.jetons.get(options.identifiant) : undefined;
  if (options.identifiant && !jeton) {
    throw new Error(`${options.identifiant} n'est pas connecté dans ce scénario.`);
  }
  const r = await fetch(`${INVITATIONS_URL}${chemin}`, {
    method: methode,
    headers: {
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
      ...(options.corps !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(options.corps !== undefined ? { body: JSON.stringify(options.corps) } : {}),
  });
  monde.reponse = { statut: r.status, corps: (await r.json()) as Record<string, unknown> };
}

When(
  '{string} crée une invitation pour la cohorte de test',
  async ({ monde }, identifiant: string) => {
    await appeler(monde, 'POST', '/invitations', {
      identifiant,
      corps: { cohorte: COHORTE_TEST },
    });
    if (monde.reponse?.statut === 201) {
      const { id, code } = monde.reponse.corps as { id: string; code: string };
      monde.invitation = { id, code };
    }
  },
);

When('{string} révoque cette invitation', async ({ monde }, identifiant: string) => {
  await appeler(monde, 'POST', `/invitations/${monde.invitation?.id ?? ''}/revocation`, {
    identifiant,
  });
  expect(monde.reponse?.statut).toBe(200);
});

When("quelqu'un présente le code {string}", async ({ monde }, code: string) => {
  await appeler(monde, 'POST', '/invitations/verification', { corps: { code } });
});

Then('un code de 8 caractères lui est montré une seule fois', ({ monde }) => {
  expect(monde.reponse?.statut).toBe(201);
  expect(monde.invitation?.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  expect(monde.reponse?.corps['cohorte']).toBe(COHORTE_TEST);
});

Then('le code est reconnu comme valable', async ({ monde }) => {
  await appeler(monde, 'POST', '/invitations/verification', {
    corps: { code: monde.invitation?.code ?? '' },
  });
  expect(monde.reponse).toEqual({ statut: 200, corps: { valide: true } });
});

Then("le code n'est pas reconnu", async ({ monde }) => {
  if (monde.invitation) {
    await appeler(monde, 'POST', '/invitations/verification', {
      corps: { code: monde.invitation.code },
    });
  }
  expect(monde.reponse).toEqual({ statut: 200, corps: { valide: false } });
});

Then(
  "la liste des invitations de la cohorte contient l'invitation sans son code",
  async ({ monde }) => {
    const { id, code } = monde.invitation ?? { id: '', code: '' };
    await appeler(monde, 'GET', `/invitations?cohorte=${COHORTE_TEST}`, {
      identifiant: 'gestionnaire-fictif-01',
    });
    expect(monde.reponse?.statut).toBe(200);
    const liste = monde.reponse?.corps['invitations'] as Record<string, unknown>[];
    expect(liste).toContainEqual(expect.objectContaining({ id, statut: 'valide' }));
    expect(JSON.stringify(liste)).not.toContain(code);
  },
);
