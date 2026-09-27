import { describe, expect, it } from 'vitest';
import { creerApi } from './api.js';

// Données FICTIVES.
describe('API professionnel', () => {
  it('appelle les routes de créneaux, report et annulation avec les bons corps', async () => {
    const appels: { url: string; methode: string; corps?: unknown }[] = [];
    const appeler = (async (url: string, init: RequestInit) => {
      appels.push({
        url,
        methode: init.method ?? 'GET',
        ...(init.body ? { corps: JSON.parse(String(init.body)) } : {}),
      });
      return new Response(JSON.stringify({ rendezVous: [], creneaux: [] }));
    }) as typeof fetch;
    const api = creerApi('/api', () => 'jeton-fictif', appeler);
    await api.mesCreneaux();
    await api.publier({ debut: '2026-10-01T08:00:00.000Z', dureeMinutes: 20, nombre: 2 });
    await api.retirer('c1');
    await api.reporter('r1', 'c2');
    expect(appels).toEqual([
      { url: '/api/creneaux', methode: 'GET' },
      {
        url: '/api/creneaux',
        methode: 'POST',
        corps: { debut: '2026-10-01T08:00:00.000Z', dureeMinutes: 20, nombre: 2 },
      },
      { url: '/api/creneaux/c1/retrait', methode: 'POST' },
      { url: '/api/rendez-vous/r1/report', methode: 'POST', corps: { creneauId: 'c2' } },
    ]);
  });
});
