import { creerJournal } from '@mbolo/journal-securise';
import { describe, expect, it } from 'vitest';
import { NotificateurHttp } from './notificateur.js';

describe('NotificateurHttp', () => {
  it('envoie gabarit et instant, jamais de texte ; un échec est journalisé sans être renvoyé', async () => {
    const lignes: string[] = [];
    const requetes: { url: string; init: RequestInit }[] = [];
    const n = new NotificateurHttp({
      url: 'http://notifications.fictif.example',
      entetes: async () => ({ authorization: 'Bearer x' }),
      journal: creerJournal({ service: 'test', ecrire: (l) => lignes.push(l) }),
      fetch: (async (url: string, init: RequestInit) => {
        requetes.push({ url, init });
        throw new Error('injoignable');
      }) as typeof fetch,
    });
    await expect(
      n.prevenir('Practitioner/prac-fictif-001', 'rendez-vous-annule', '2026-10-01T08:00:00Z'),
    ).resolves.toBeUndefined();
    expect(requetes[0]?.url).toBe('http://notifications.fictif.example/notifications');
    expect(JSON.parse(String(requetes[0]?.init.body))).toEqual({
      destinataire: 'Practitioner/prac-fictif-001',
      gabarit: 'rendez-vous-annule',
      instant: '2026-10-01T08:00:00Z',
    });
    expect(lignes.join('\n')).toContain('service de notifications injoignable');
  });
});
