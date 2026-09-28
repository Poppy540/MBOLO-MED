import type { Utilisateur } from '@mbolo/identite';
import { creerJournal } from '@mbolo/journal-securise';
import { describe, expect, it } from 'vitest';
import { DepotCreneauxMemoire } from './creneaux.js';
import { IdentitesMemoire } from './identites.js';
import { DepotRendezVousMemoire, ServiceTeleconsultation } from './rendez-vous.js';
import { creerServeur } from './serveur.js';

// Jetons factices : la vérification réelle (signature Keycloak) est testée dans @mbolo/identite.
const PATIENT: Utilisateur = { sujet: 'u-p1', roles: ['patient'], patientId: 'pat-fictif-001' };

async function serveur(limites = { parMinute: 50, identiteParMinute: 3 }) {
  const service = new ServiceTeleconsultation(
    new DepotRendezVousMemoire(),
    new DepotCreneauxMemoire(),
    { preparer: async () => undefined, jeton: async () => 'jeton-salle-fictif' } as never,
    { estActif: async (nom) => nom !== 'paiement.mobile-money' },
    () => new Date('2026-09-27T09:00:00Z'),
    undefined,
    undefined,
    new IdentitesMemoire(new Map([['pat-fictif-001', 'a-verifier']])),
  );
  return creerServeur({
    verifierJeton: async (j) => {
      if (j !== 'patient') throw new Error('jeton invalide');
      return PATIENT;
    },
    service,
    journal: creerJournal({ service: 'teleconsultation', ecrire: () => undefined }),
    limites,
  });
}

const identite = (app: Awaited<ReturnType<typeof serveur>>) =>
  app.inject({ method: 'GET', url: '/identite', headers: { authorization: 'Bearer patient' } });

describe('API de téléconsultation : statut d’identité et limites d’appels', () => {
  it('donne au patient le statut de son identité, et exige une authentification', async () => {
    const app = await serveur();
    const r = await identite(app);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ statut: 'a-verifier' });
    expect((await app.inject({ method: 'GET', url: '/identite' })).statusCode).toBe(401);
  });

  it('limite les appels au statut d’identité, qui interrogent le dossier', async () => {
    const app = await serveur({ parMinute: 50, identiteParMinute: 3 });
    for (let i = 0; i < 3; i++) expect((await identite(app)).statusCode).toBe(200);
    const r = await identite(app);
    expect(r.statusCode).toBe(429);
    expect(r.json()).toEqual({ erreur: 'Trop de requêtes. Réessayez dans une minute.' });
  });

  it('limite aussi les autres routes', async () => {
    const app = await serveur({ parMinute: 2, identiteParMinute: 100 });
    const rdv = () =>
      app.inject({
        method: 'GET',
        url: '/rendez-vous',
        headers: { authorization: 'Bearer patient' },
      });
    expect((await rdv()).statusCode).toBe(200);
    expect((await rdv()).statusCode).toBe(200);
    expect((await rdv()).statusCode).toBe(429);
  });
});
