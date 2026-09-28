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

describe('API notifications — invitation d’un proche (ADR-0019)', () => {
  const monterInvitations = async () => {
    const canal = new CanalSimule();
    const lignes: string[] = [];
    const app = await creerServeur({
      verifierAppelant: async (j) => {
        if (j === 'jeton-invitations') return 'mbolo-invitations-service';
        if (j === 'jeton-valide') return 'mbolo-teleconsultation-service';
        throw new Error('refusé');
      },
      service: new ServiceNotifications(
        { telephone: async () => '+241 00 00 00 00', accepteRappels: async () => true },
        canal,
      ),
      journal: creerJournal({ service: 'test', ecrire: (l) => lignes.push(l) }),
      invitations: { canal, appelants: ['mbolo-invitations-service'] },
    });
    return { app, canal, lignes };
  };
  // Numéro manifestement fictif, au format international.
  const invitation = { telephone: '+33000000000', code: 'ABCD-EFGH', jours: 7 };

  it('envoie le code au numéro saisi, sans le garder ni le journaliser', async () => {
    const { app, canal, lignes } = await monterInvitations();
    const r = await app.inject({
      method: 'POST',
      url: '/invitations-proche',
      headers: { authorization: 'Bearer jeton-invitations' },
      payload: invitation,
    });
    expect(r.statusCode).toBe(202);
    expect(r.json()).toEqual({ resultat: 'envoyee' });
    expect(canal.boite).toHaveLength(1);
    expect(canal.boite[0]?.telephone).toBe('+33000000000');
    // Ni nom du patient ni donnée de santé : le code et la durée seulement.
    expect(canal.boite[0]?.texte).toBe(
      'Mbolo Santé : vous êtes invité à suivre un proche. Votre code : ABCD-EFGH, valable 7 jours. Créez votre compte dans l’application.',
    );
    expect(canal.boite[0]?.texte.length).toBeLessThanOrEqual(160);
    const journal = lignes.join('\n');
    expect(journal).not.toContain('+33000000000');
    expect(journal).not.toContain('ABCD-EFGH');
  });

  it('réservé au service invitations, qui n’envoie rien d’autre', async () => {
    const { app, canal } = await monterInvitations();
    const parAutre = await app.inject({
      method: 'POST',
      url: '/invitations-proche',
      headers: { authorization: 'Bearer jeton-valide' },
      payload: invitation,
    });
    expect(parAutre.statusCode).toBe(403);
    const rappel = await app.inject({
      method: 'POST',
      url: '/notifications',
      headers: { authorization: 'Bearer jeton-invitations' },
      payload: corps,
    });
    expect(rappel.statusCode).toBe(403);
    expect(canal.boite).toHaveLength(0);
  });

  it('refuse un numéro non international, un code mal formé ou un texte en plus', async () => {
    const { app } = await monterInvitations();
    for (const payload of [
      { ...invitation, telephone: '00 00 00 00' },
      { ...invitation, code: 'ABCD-EFG0' },
      { ...invitation, jours: 0 },
      { ...invitation, message: '[FICTIF] texte libre' },
    ]) {
      const r = await app.inject({
        method: 'POST',
        url: '/invitations-proche',
        headers: { authorization: 'Bearer jeton-invitations' },
        payload,
      });
      expect(r.statusCode).toBe(400);
    }
  });

  it('alerte le patient quand son proche crée son compte, même sans consentement aux rappels', async () => {
    const canal = new CanalSimule();
    const lignes: string[] = [];
    const app = await creerServeur({
      verifierAppelant: async (j) => {
        if (j === 'jeton-invitations') return 'mbolo-invitations-service';
        if (j === 'jeton-valide') return 'mbolo-teleconsultation-service';
        throw new Error('refusé');
      },
      service: new ServiceNotifications(
        { telephone: async () => '+241 00 00 00 01', accepteRappels: async () => false },
        canal,
      ),
      journal: creerJournal({ service: 'test', ecrire: (l) => lignes.push(l) }),
      invitations: { canal, appelants: ['mbolo-invitations-service'] },
    });
    const alerte = (jeton: string, payload: object = { patientId: 'pat-fictif-001' }) =>
      app.inject({
        method: 'POST',
        url: '/alertes/proche-inscrit',
        headers: { authorization: `Bearer ${jeton}` },
        payload,
      });
    expect((await alerte('jeton-valide')).statusCode).toBe(403);
    expect((await alerte('jeton-invitations', { patientId: '../x' })).statusCode).toBe(400);
    const r = await alerte('jeton-invitations');
    expect(r.json()).toEqual({ resultat: 'envoyee' });
    expect(canal.boite).toHaveLength(1);
    const texte = canal.boite[0]?.texte ?? '';
    expect(texte).toContain('votre proche invité a créé son compte');
    expect(texte.length).toBeLessThanOrEqual(160);
    // Ni identifiant, ni prénom, ni numéro dans le texte ou le journal.
    expect(texte).not.toMatch(/pat-|FICTIF|\+241/);
    expect(lignes.join('\n')).not.toContain('+241');
  });
});
