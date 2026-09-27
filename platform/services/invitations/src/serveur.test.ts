import { describe, expect, it } from 'vitest';
import type { Utilisateur } from '@mbolo/identite';
import { creerJournal } from '@mbolo/journal-securise';
import { creerEmpreinte } from './codes.js';
import { DepotMemoire } from './depot.js';
import { Limiteur } from './limiteur.js';
import { creerServeur } from './serveur.js';
import { ServiceInvitations } from './service.js';

// Jetons factices : le vérificateur réel (signature Keycloak) est testé dans @mbolo/identite.
const UTILISATEURS: Record<string, Utilisateur> = {
  gestionnaire: { sujet: 'sujet-gestionnaire-fictif', roles: ['gestion-invitations'] },
  medecin: {
    sujet: 'sujet-medecin-fictif',
    roles: ['professionnel'],
    practitionerId: 'prac-fictif',
  },
  agent: {
    sujet: 'sujet-agent-fictif',
    roles: ['gestion-invitations', 'agent-ia'],
    agent: { nom: 'agent-06', patientSession: 'pat-fictif' },
  },
};

function serveur(maxEssais = 10) {
  const lignes: string[] = [];
  const app = creerServeur({
    verifierJeton: async (j) => {
      const u = UTILISATEURS[j];
      if (!u) throw new Error('jeton invalide');
      return u;
    },
    service: new ServiceInvitations(new DepotMemoire(), creerEmpreinte('essai-'.repeat(8)), {
      cohortes: ['ville-fictive'],
      quotaParCohorte: 100,
      validiteJours: 14,
    }),
    limiteur: new Limiteur(maxEssais, 60_000),
    journal: creerJournal({ service: 'invitations', ecrire: (l) => lignes.push(l) }),
  });
  return { app, lignes };
}

const creer = (app: ReturnType<typeof serveur>['app'], jeton?: string, cohorte = 'ville-fictive') =>
  app.inject({
    method: 'POST',
    url: '/invitations',
    headers: jeton ? { authorization: `Bearer ${jeton}` } : {},
    payload: { cohorte },
  });

describe('API des invitations', () => {
  it('le gestionnaire crée un code, montré une seule fois et jamais journalisé', async () => {
    const { app, lignes } = serveur();
    const r = await creer(app, 'gestionnaire');
    expect(r.statusCode).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    const { code, id } = r.json<{ code: string; id: string }>();
    expect(lignes.join('\n')).toContain(id);
    expect(lignes.join('\n')).not.toContain(code);
    expect(lignes.join('\n')).not.toContain(code.replace('-', ''));

    const liste = await app.inject({
      method: 'GET',
      url: '/invitations?cohorte=ville-fictive',
      headers: { authorization: 'Bearer gestionnaire' },
    });
    expect(liste.body).not.toContain(code);
    expect(liste.json<{ invitations: { id: string }[] }>().invitations[0]?.id).toBe(id);
  });

  it('refuse la création sans jeton, à un médecin et à un agent IA', async () => {
    const { app } = serveur();
    expect((await creer(app)).statusCode).toBe(401);
    expect((await creer(app, 'jeton-inconnu')).statusCode).toBe(401);
    expect((await creer(app, 'medecin')).statusCode).toBe(403);
    expect((await creer(app, 'agent')).statusCode).toBe(403);
  });

  it('refuse une cohorte fermée et un champ inconnu', async () => {
    const { app } = serveur();
    expect((await creer(app, 'gestionnaire', 'autre-ville')).json()).toMatchObject({
      motif: 'cohorte-inconnue',
    });
    const r = await app.inject({
      method: 'POST',
      url: '/invitations',
      headers: { authorization: 'Bearer gestionnaire' },
      payload: { cohorte: 'ville-fictive', note: 'texte libre' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('vérifie un code sans authentification, puis refuse un code révoqué', async () => {
    const { app } = serveur();
    const { code, id } = (await creer(app, 'gestionnaire')).json<{ code: string; id: string }>();
    const verifier = (c: string) =>
      app.inject({ method: 'POST', url: '/invitations/verification', payload: { code: c } });
    expect((await verifier(code.toLowerCase())).json()).toEqual({ valide: true });
    const revocation = await app.inject({
      method: 'POST',
      url: `/invitations/${id}/revocation`,
      headers: { authorization: 'Bearer gestionnaire' },
    });
    expect(revocation.statusCode).toBe(200);
    expect((await verifier(code)).json()).toEqual({ valide: false });
    expect((await verifier('ZZZZ-ZZZZ')).json()).toEqual({ valide: false });
  });

  it('limite les essais de code', async () => {
    const { app } = serveur(2);
    const essai = () =>
      app.inject({
        method: 'POST',
        url: '/invitations/verification',
        payload: { code: 'ZZZZ-ZZZZ' },
      });
    expect((await essai()).statusCode).toBe(200);
    expect((await essai()).statusCode).toBe(200);
    const r = await essai();
    expect(r.statusCode).toBe(429);
    expect(r.json()).toMatchObject({ motif: 'trop-d-essais' });
  });

  it('refuse la révocation à un médecin', async () => {
    const { app } = serveur();
    const { id } = (await creer(app, 'gestionnaire')).json<{ id: string }>();
    const r = await app.inject({
      method: 'POST',
      url: `/invitations/${id}/revocation`,
      headers: { authorization: 'Bearer medecin' },
    });
    expect(r.statusCode).toBe(403);
  });
});
