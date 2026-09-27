import { creerJournal } from '@mbolo/journal-securise';
import { describe, expect, it } from 'vitest';
import { creerServeur } from './serveur.js';
import type { ServiceConsultation } from './service.js';

// Jeton et service factices : seule la limite d'appels est testée ici (le reste : service.test.ts).
describe('API de consultation : limite d’appels', () => {
  it('au-delà de la limite par minute, répond 429 avec un message simple', async () => {
    const app = await creerServeur({
      verifierJeton: async () => {
        throw new Error('jeton invalide');
      },
      service: {} as ServiceConsultation,
      journal: creerJournal({ service: 'consultation', ecrire: () => undefined }),
      limiteParMinute: 2,
    });
    await app.inject({ method: 'GET', url: '/sante' });
    await app.inject({ method: 'GET', url: '/sante' });
    const r = await app.inject({ method: 'GET', url: '/sante' });
    expect(r.statusCode).toBe(429);
    expect(r.json()).toEqual({ erreur: 'Trop de requêtes. Réessayez dans une minute.' });
  });
});
