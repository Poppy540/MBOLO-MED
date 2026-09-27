import { describe, expect, it } from 'vitest';
import { creerApi } from './api.js';

// Données FICTIVES.
describe('API patient', () => {
  it('appelle les routes de téléconsultation avec les bons corps', async () => {
    const appels: { url: string; methode: string; corps?: unknown }[] = [];
    const appeler = (async (url: string, init: RequestInit) => {
      appels.push({
        url,
        methode: init.method ?? 'GET',
        ...(init.body ? { corps: JSON.parse(String(init.body)) } : {}),
      });
      return new Response(JSON.stringify({ rendezVous: [], creneaux: [] }));
    }) as typeof fetch;
    const api = creerApi('/api/teleconsultation', () => 'jeton-fictif', appeler);
    await api.mesRendezVous();
    await api.creneauxLibres('prac-fictif-001');
    await api.reserver('creneau-fictif-1');
    await api.annuler('rdv-fictif-1');
    expect(appels).toEqual([
      { url: '/api/teleconsultation/rendez-vous', methode: 'GET' },
      { url: '/api/teleconsultation/praticiens/prac-fictif-001/creneaux', methode: 'GET' },
      {
        url: '/api/teleconsultation/rendez-vous',
        methode: 'POST',
        corps: { creneauId: 'creneau-fictif-1' },
      },
      { url: '/api/teleconsultation/rendez-vous/rdv-fictif-1/annulation', methode: 'POST' },
    ]);
  });
});
