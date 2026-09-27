import { creerJournal } from '@mbolo/journal-securise';
import { describe, expect, it } from 'vitest';
import { CanalSimule, ServiceNotifications } from './notifications.js';
import { creerServeur } from './serveur.js';

// Données FICTIVES ; vérification de jeton simulée (le vrai contrôle est testé en e2e).
const monter = async (limiteParMinute?: number) => {
  const canal = new CanalSimule();
  const lignes: string[] = [];
  const app = await creerServeur({
    verifierAppelant: async (j) => {
      if (j !== 'jeton-valide') throw new Error('refusé');
      return 'mbolo-teleconsultation-service';
    },
    service: new ServiceNotifications(
      { telephone: async () => '+241 00 00 00 00', accepteRappels: async () => true },
      canal,
    ),
    journal: creerJournal({ service: 'test', ecrire: (l) => lignes.push(l) }),
    simulation: canal,
    ...(limiteParMinute ? { limiteParMinute } : {}),
  });
  return { app, canal, lignes };
};

const corps = {
  destinataire: 'Practitioner/prac-fictif-001',
  gabarit: 'rendez-vous-annule',
  instant: '2026-10-01T08:00:00Z',
};

describe('API notifications', () => {
  it('exige un jeton de service valide, y compris pour la boîte simulée', async () => {
    const { app } = await monter();
    for (const headers of [{}, { authorization: 'Bearer autre' }]) {
      expect(
        (await app.inject({ method: 'POST', url: '/notifications', headers, payload: corps }))
          .statusCode,
      ).toBe(401);
      expect(
        (await app.inject({ method: 'GET', url: '/simulation/boite', headers })).statusCode,
      ).toBe(401);
    }
  });

  it('refuse un texte libre ou un gabarit inconnu', async () => {
    const { app, canal } = await monter();
    const headers = { authorization: 'Bearer jeton-valide' };
    for (const payload of [
      { ...corps, texte: '[FICTIF] texte libre' },
      { ...corps, gabarit: 'message-libre' },
      { ...corps, destinataire: 'RelatedPerson/proche-fictif-001' },
    ]) {
      expect(
        (await app.inject({ method: 'POST', url: '/notifications', headers, payload })).statusCode,
      ).toBe(400);
    }
    expect(canal.boite).toEqual([]);
  });

  it('envoie une notification conforme (202), sans numéro ni texte dans le journal', async () => {
    const { app, canal, lignes } = await monter();
    const r = await app.inject({
      method: 'POST',
      url: '/notifications',
      headers: { authorization: 'Bearer jeton-valide' },
      payload: corps,
    });
    expect(r.statusCode).toBe(202);
    expect(r.json()).toEqual({ resultat: 'envoyee' });
    expect(canal.boite).toHaveLength(1);
    const journal = lignes.join('\n');
    expect(journal).toContain('notification traitée');
    expect(journal).not.toContain('00 00 00');
    expect(journal).not.toContain(canal.boite[0]?.texte ?? 'absent');
  });

  it('au-delà de la limite par minute, répond 429', async () => {
    const { app } = await monter(2);
    await app.inject({ method: 'GET', url: '/sante' });
    await app.inject({ method: 'GET', url: '/sante' });
    const r = await app.inject({ method: 'GET', url: '/sante' });
    expect(r.statusCode).toBe(429);
    expect(r.json()).toEqual({ erreur: 'Trop de requêtes. Réessayez dans une minute.' });
  });
});
