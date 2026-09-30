import { creerJournal } from '@mbolo/journal-securise';
import { describe, expect, it } from 'vitest';
import { CanalSimule, ServiceNotifications } from './notifications.js';
import { LimiteCodes } from './limite-codes.js';
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
      {
        telephone: async () => '+241 00 00 00 00',
        accepteRappels: async () => true,
        enAttenteApresPerte: async () => false,
      },
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
        {
          telephone: async () => '+241 00 00 00 00',
          accepteRappels: async () => true,
          enAttenteApresPerte: async () => false,
        },
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
        {
          telephone: async () => '+241 00 00 00 01',
          accepteRappels: async () => false,
          enAttenteApresPerte: async () => false,
        },
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
    // Retrait des proches par l'équipe (rôle assistance-patient) : confirmation au patient.
    const retrait = await app.inject({
      method: 'POST',
      url: '/alertes/proches-retires',
      headers: { authorization: 'Bearer jeton-invitations' },
      payload: { patientId: 'pat-fictif-001' },
    });
    expect(retrait.json()).toEqual({ resultat: 'envoyee' });
    const confirmation = canal.boite[1]?.texte ?? '';
    expect(confirmation).toContain('l’équipe a retiré l’accès de vos proches');
    expect(confirmation.length).toBeLessThanOrEqual(160);
    expect(confirmation).not.toMatch(/pat-|FICTIF|\+241/);
    const inconnue = await app.inject({
      method: 'POST',
      url: '/alertes/autre',
      headers: { authorization: 'Bearer jeton-invitations' },
      payload: { patientId: 'pat-fictif-001' },
    });
    expect(inconnue.statusCode).toBe(400);
    expect(lignes.join('\n')).not.toContain('+241');
  });
});

describe('API notifications — code de double authentification (ADR-0022)', () => {
  const monterCodes = async (limite?: LimiteCodes, limiteParNumero?: LimiteCodes) => {
    const canal = new CanalSimule();
    const lignes: string[] = [];
    const app = await creerServeur({
      verifierAppelant: async (j) => {
        if (j === 'jeton-keycloak') return 'mbolo-keycloak-inscription';
        if (j === 'jeton-valide') return 'mbolo-teleconsultation-service';
        if (j === 'jeton-documents') return 'mbolo-documents-service';
        throw new Error('refusé');
      },
      numeroChange: { appelants: ['mbolo-documents-service'] },
      // Sans consentement aux rappels : le code part quand même, c'est le patient qui le demande.
      service: new ServiceNotifications(
        {
          telephone: async () => '+241 00 00 00 05',
          accepteRappels: async () => false,
          enAttenteApresPerte: async () => false,
        },
        canal,
      ),
      journal: creerJournal({ service: 'test', ecrire: (l) => lignes.push(l) }),
      codesConnexion: {
        appelants: ['mbolo-keycloak-inscription'],
        ...(limite ? { limite } : {}),
        ...(limiteParNumero ? { limiteParNumero } : {}),
      },
    });
    const envoyer = (jeton: string | undefined, payload: object) =>
      app.inject({
        method: 'POST',
        url: '/codes-connexion',
        ...(jeton ? { headers: { authorization: `Bearer ${jeton}` } } : {}),
        payload,
      });
    return { app, canal, lignes, envoyer };
  };

  it('envoie le code au numéro du dossier, sans le journaliser', async () => {
    const { canal, lignes, envoyer } = await monterCodes();
    const r = await envoyer('jeton-keycloak', { patientId: 'pat-fictif-005', code: '482913' });
    expect(r.statusCode).toBe(202);
    expect(r.json()).toEqual({ resultat: 'envoyee' });
    expect(canal.boite[0]?.telephone).toBe('+241 00 00 00 05');
    const texte = canal.boite[0]?.texte ?? '';
    expect(texte).toBe(
      'Mbolo Santé : votre code est 482913. Il expire dans 5 minutes. Ne le donnez à personne, même pas à l’équipe.',
    );
    expect(texte.length).toBeLessThanOrEqual(160);
    const journal = lignes.join('\n');
    expect(journal).not.toContain('482913');
    expect(journal).not.toContain('+241');
  });

  it('au plus 10 codes par dossier et par heure, toutes sessions confondues ; alertes nommées', async () => {
    let t = 0;
    const { canal, lignes, envoyer } = await monterCodes(new LimiteCodes(10, 3_600_000, () => t));
    const corps = { patientId: 'pat-fictif-005', code: '482913' };
    for (let i = 0; i < 10; i++) {
      expect((await envoyer('jeton-keycloak', corps)).json()).toEqual({ resultat: 'envoyee' });
    }
    const bloque = await envoyer('jeton-keycloak', corps);
    expect(bloque.statusCode).toBe(202);
    expect(bloque.json()).toEqual({ resultat: 'trop-de-codes' });
    expect(canal.boite).toHaveLength(10);
    // Un autre dossier n'est pas touché ; une heure plus tard, le dossier bloqué reçoit de nouveau.
    const autre = await envoyer('jeton-keycloak', { ...corps, patientId: 'pat-fictif-004' });
    expect(autre.json()).toEqual({ resultat: 'envoyee' });
    t = 3_600_000;
    expect((await envoyer('jeton-keycloak', corps)).json()).toEqual({ resultat: 'envoyee' });
    const alertes = lignes
      .map((l) => JSON.parse(l) as { contexte?: { alerte?: string } })
      .map((l) => l.contexte?.alerte)
      .filter(Boolean);
    expect(alertes.filter((a) => a === 'code-connexion')).toHaveLength(12);
    expect(alertes.filter((a) => a === 'code-connexion-bloque')).toHaveLength(1);
    expect(lignes.join('\n')).not.toContain('482913');
  });

  it('valide le numéro saisi à « Mon identité » : code au numéro donné, limité par numéro (C8)', async () => {
    const { app, canal, lignes } = await monterCodes(
      undefined,
      new LimiteCodes(2, 3_600_000, () => 0),
    );
    const verifier = (jeton: string, payload: object) =>
      app.inject({
        method: 'POST',
        url: '/codes-verification',
        headers: { authorization: `Bearer ${jeton}` },
        payload,
      });
    const r = await verifier('jeton-keycloak', { telephone: '+241 00 00 00 09', code: '482913' });
    expect(r.statusCode).toBe(202);
    expect(r.json()).toEqual({ resultat: 'envoyee' });
    expect(canal.boite[0]).toMatchObject({
      telephone: '+241 00 00 00 09',
      texte: expect.stringContaining('votre code est 482913') as unknown,
    });
    // Même numéro écrit autrement : même compteur ; au-delà de la limite, rien n'est envoyé.
    await verifier('jeton-keycloak', { telephone: '24100000009', code: '482913' });
    const bloque = await verifier('jeton-keycloak', { telephone: '+241000 00009', code: '482913' });
    expect(bloque.json()).toEqual({ resultat: 'trop-de-codes' });
    expect(canal.boite).toHaveLength(2);
    // Réservé à l'extension Keycloak ; numéro et code au format attendu seulement.
    expect(
      (await verifier('jeton-valide', { telephone: '+241 00 00 00 09', code: '482913' }))
        .statusCode,
    ).toBe(403);
    for (const payload of [
      { telephone: 'appelez-moi', code: '482913' },
      { telephone: '+241 00 00 00 09', code: '4829' },
      { telephone: '+241 00 00 00 09', code: '482913', nom: 'x' },
    ]) {
      expect((await verifier('jeton-keycloak', payload)).statusCode).toBe(400);
    }
    const journal = lignes.join('\n');
    expect(journal).not.toContain('482913');
    expect(journal).not.toContain('00 00 09');
    expect(journal).not.toContain('00000009');
  });

  it('application d’authentification (ADR-0024) : alertes par l’extension Keycloak seule', async () => {
    const { app, canal } = await monterCodes();
    const alerter = (jeton: string, alerte: string) =>
      app.inject({
        method: 'POST',
        url: `/alertes-compte/${alerte}`,
        headers: { authorization: `Bearer ${jeton}` },
        payload: { patientId: 'pat-fictif-005' },
      });
    expect((await alerter('jeton-keycloak', 'application-activee')).json()).toEqual({
      resultat: 'envoyee',
    });
    expect((await alerter('jeton-keycloak', 'application-retiree')).json()).toEqual({
      resultat: 'envoyee',
    });
    expect(canal.boite.map((m) => m.texte)).toEqual([
      'Mbolo Santé : une application d’authentification vient d’être ajoutée à votre compte. Vos codes n’arriveront plus par SMS. Si ce n’est pas vous, contactez l’équipe.',
      'Mbolo Santé : l’application d’authentification de votre compte vient d’être retirée. Vos codes reviennent par SMS. Si ce n’est pas vous, contactez l’équipe.',
    ]);
    expect(canal.boite[0]?.telephone).toBe('+241 00 00 00 05');
    // Ni un autre service, ni une autre alerte par cette route.
    expect((await alerter('jeton-valide', 'application-activee')).statusCode).toBe(403);
    expect((await alerter('jeton-documents', 'application-retiree')).statusCode).toBe(403);
    expect((await alerter('jeton-keycloak', 'compte-recupere')).statusCode).toBe(400);
  });

  it('numéro changé (ADR-0023) : alerte à l’ancien numéro, par l’extension Keycloak seule', async () => {
    const { app, canal, lignes } = await monterCodes();
    const alerter = (jeton: string) =>
      app.inject({
        method: 'POST',
        url: '/numero-change',
        headers: { authorization: `Bearer ${jeton}` },
        payload: { patientId: 'pat-fictif-005' },
      });
    const r = await alerter('jeton-keycloak');
    expect(r.json()).toEqual({ resultat: 'envoyee' });
    expect(canal.boite[0]).toMatchObject({
      telephone: '+241 00 00 00 05',
      texte:
        'Mbolo Santé : le numéro de votre compte vient d’être changé. Si ce n’est pas vous, contactez l’équipe.',
    });
    const alertes = lignes.map(
      (l) => (JSON.parse(l) as { contexte?: { alerte?: string } }).contexte?.alerte,
    );
    expect(alertes).toContain('numero-change');
    expect((await alerter('jeton-valide')).statusCode).toBe(403);
    // Après une perte, c'est le service documents qui prévient l'ancien numéro ; il n'envoie rien
    // d'autre (ni code, ni autre alerte).
    expect((await alerter('jeton-documents')).json()).toEqual({ resultat: 'envoyee' });
    const documents = { authorization: 'Bearer jeton-documents' };
    const code = await app.inject({
      method: 'POST',
      url: '/codes-connexion',
      headers: documents,
      payload: { patientId: 'pat-fictif-005', code: '482913' },
    });
    expect(code.statusCode).toBe(403);
    const autre = await app.inject({
      method: 'POST',
      url: '/notifications',
      headers: documents,
      payload: {
        destinataire: 'Patient/pat-fictif-005',
        gabarit: 'rendez-vous-annule',
        instant: '2026-10-01T08:00:00Z',
      },
    });
    expect(autre.statusCode).toBe(403);
    expect(lignes.join('\n')).not.toContain('+241');
  });

  it('seule l’extension Keycloak envoie un code, et elle n’envoie rien d’autre', async () => {
    const { app, canal, envoyer } = await monterCodes();
    const corps = { patientId: 'pat-fictif-005', code: '482913' };
    expect((await envoyer(undefined, corps)).statusCode).toBe(401);
    expect((await envoyer('jeton-valide', corps)).statusCode).toBe(403);
    for (const payload of [
      { ...corps, code: '12345' },
      { ...corps, code: 'ABCDEF' },
      { ...corps, patientId: '../x' },
      { ...corps, telephone: '+33000000009' },
    ]) {
      expect((await envoyer('jeton-keycloak', payload)).statusCode).toBe(400);
    }
    const autre = await app.inject({
      method: 'POST',
      url: '/notifications',
      headers: { authorization: 'Bearer jeton-keycloak' },
      payload: {
        destinataire: 'Patient/pat-fictif-005',
        gabarit: 'rendez-vous-annule',
        instant: '2026-10-01T08:00:00Z',
      },
    });
    expect(autre.statusCode).toBe(403);
    expect(canal.boite).toHaveLength(0);
  });
});
