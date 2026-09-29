import { describe, expect, it } from 'vitest';
import type { Utilisateur } from '@mbolo/identite';
import { creerJournal } from '@mbolo/journal-securise';
import { creerEmpreinte } from './codes.js';
import { DepotMemoire } from './depot.js';
import { LimiteurMemoire } from './limiteur.js';
import { creerServeur } from './serveur.js';
import { ErreurProche, ServiceProches } from './proches.js';
import type { ServiceAssistance } from './assistance.js';
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

async function serveur(maxEssais = 10, limiteParMinute?: number) {
  const lignes: string[] = [];
  const app = await creerServeur({
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
    limiteur: new LimiteurMemoire(maxEssais, 60_000),
    journal: creerJournal({ service: 'invitations', ecrire: (l) => lignes.push(l) }),
    // Jeton factice de l'extension Keycloak ; tout autre jeton est refusé.
    verifierService: async (j) => {
      if (j !== 'extension') throw new Error('jeton de service invalide');
      return 'mbolo-keycloak-inscription';
    },
    ...(limiteParMinute ? { limiteParMinute } : {}),
  });
  return { app, lignes };
}

const creer = (
  app: Awaited<ReturnType<typeof serveur>>['app'],
  jeton?: string,
  cohorte = 'ville-fictive',
) =>
  app.inject({
    method: 'POST',
    url: '/invitations',
    headers: jeton ? { authorization: `Bearer ${jeton}` } : {},
    payload: { cohorte },
  });

describe('API des invitations', () => {
  it('le gestionnaire crée un code, montré une seule fois et jamais journalisé', async () => {
    const { app, lignes } = await serveur();
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
    const { app } = await serveur();
    expect((await creer(app)).statusCode).toBe(401);
    expect((await creer(app, 'jeton-inconnu')).statusCode).toBe(401);
    expect((await creer(app, 'medecin')).statusCode).toBe(403);
    expect((await creer(app, 'agent')).statusCode).toBe(403);
  });

  it('refuse une cohorte fermée et un champ inconnu', async () => {
    const { app } = await serveur();
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
    const { app } = await serveur();
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

  it('limite les essais de code, et signale l’essai bloqué à la supervision', async () => {
    const { app, lignes } = await serveur(2);
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
    const alertes = lignes
      .map((l) => JSON.parse(l) as { contexte?: { alerte?: string; verification?: string } })
      .filter((l) => l.contexte?.alerte === 'essais-bloques');
    expect(alertes).toHaveLength(1);
    expect(alertes[0]?.contexte?.verification).toBe('code');
  });

  it('refuse la révocation à un médecin', async () => {
    const { app } = await serveur();
    const { id } = (await creer(app, 'gestionnaire')).json<{ id: string }>();
    const r = await app.inject({
      method: 'POST',
      url: `/invitations/${id}/revocation`,
      headers: { authorization: 'Bearer medecin' },
    });
    expect(r.statusCode).toBe(403);
  });
});

describe('inscription par l’extension Keycloak', () => {
  const appel = (
    app: Awaited<ReturnType<typeof serveur>>['app'],
    chemin: string,
    payload: Record<string, string>,
    jeton = 'extension',
  ) =>
    app.inject({
      method: 'POST',
      url: `/inscription/${chemin}`,
      headers: { authorization: `Bearer ${jeton}` },
      payload,
    });

  it('contrôle puis utilise un code une seule fois, sans jamais le journaliser', async () => {
    const { app, lignes } = await serveur();
    const { code } = (await creer(app, 'gestionnaire')).json<{ code: string }>();
    const controle = await appel(app, 'controle', { code, adresse: '192.0.2.10' });
    expect(controle.json()).toEqual({ valide: true });

    const premiere = await appel(app, 'utilisation', { code, sujet: 'sujet-patient-fictif-1' });
    expect(premiere.statusCode).toBe(200);
    expect(premiere.json()).toEqual({ cohorte: 'ville-fictive', type: 'patient' });
    const seconde = await appel(app, 'utilisation', { code, sujet: 'sujet-patient-fictif-2' });
    expect(seconde.statusCode).toBe(409);
    expect((await appel(app, 'controle', { code, adresse: '192.0.2.10' })).json()).toEqual({
      valide: false,
    });
    expect(lignes.join('\n')).not.toContain(code.replace('-', ''));
  });

  it('refuse un jeton d’utilisateur, même celui d’un gestionnaire', async () => {
    const { app } = await serveur();
    for (const jeton of ['gestionnaire', 'medecin', 'inconnu']) {
      const r = await appel(app, 'utilisation', { code: 'ABCD-EFGH', sujet: 'x' }, jeton);
      expect(r.statusCode).toBe(401);
    }
  });

  it('limite les essais par adresse du navigateur, pas par adresse de Keycloak', async () => {
    const { app } = await serveur(2);
    const essai = (adresse: string) => appel(app, 'controle', { code: 'ZZZZ-ZZZZ', adresse });
    expect((await essai('192.0.2.1')).statusCode).toBe(200);
    expect((await essai('192.0.2.1')).statusCode).toBe(200);
    expect((await essai('192.0.2.1')).statusCode).toBe(429);
    expect((await essai('192.0.2.2')).statusCode).toBe(200);
  });

  it('refuse un identifiant de compte mal formé', async () => {
    const { app } = await serveur();
    const r = await appel(app, 'utilisation', { code: 'ABCD-EFGH', sujet: 'x; drop' });
    expect(r.statusCode).toBe(400);
  });
});

describe('limite générale d’appels', () => {
  it('au-delà de la limite par minute, répond 429 sur toutes les routes', async () => {
    const { app } = await serveur(10, 2);
    await app.inject({ method: 'GET', url: '/sante' });
    await app.inject({ method: 'GET', url: '/sante' });
    const r = await app.inject({ method: 'GET', url: '/sante' });
    expect(r.statusCode).toBe(429);
    expect(r.json()).toEqual({ erreur: 'Trop de requêtes. Réessayez dans une minute.' });
  });
});

describe('API des proches (ADR-0019)', () => {
  const PATIENT: Utilisateur = {
    sujet: 'sujet-patient-fictif',
    roles: ['patient'],
    patientId: 'pat-fictif-001',
  };
  const monterProches = async () => {
    const lignes: string[] = [];
    const depot = new DepotMemoire();
    const empreinte = creerEmpreinte('essai-'.repeat(8));
    const proches = new ServiceProches(
      depot,
      empreinte,
      {
        creer: async () => 'rp-fictif-9',
        lire: async () => undefined,
        activer: async () => undefined,
        desactiver: async () => undefined,
      },
      { accorder: async () => undefined, retirer: async () => undefined },
      { envoyer: async () => 'envoyee', alerterPatient: async () => 'envoyee' },
      { estActif: async () => true },
      { max: 3, validiteJours: 7, parJour: 5, env: 'dev' },
    );
    const app = await creerServeur({
      verifierJeton: async (j) => {
        const u = j === 'patient' ? PATIENT : UTILISATEURS[j];
        if (!u) throw new Error('jeton invalide');
        return u;
      },
      service: new ServiceInvitations(depot, empreinte, {
        cohortes: ['ville-fictive'],
        quotaParCohorte: 100,
        validiteJours: 14,
      }),
      limiteur: new LimiteurMemoire(10, 60_000),
      journal: creerJournal({ service: 'invitations', ecrire: (l) => lignes.push(l) }),
      proches,
    });
    return { app, lignes };
  };
  const demande = {
    prenom: 'Serge [FICTIF]',
    lien: 'CHILD',
    telephone: '+33000000000',
    versionTexte: 'c-proche-v0.1-brouillon',
  };
  const inviter = (
    app: Awaited<ReturnType<typeof monterProches>>['app'],
    jeton: string | undefined,
    payload: object = demande,
  ) =>
    app.inject({
      method: 'POST',
      url: '/proches',
      headers: jeton ? { authorization: `Bearer ${jeton}` } : {},
      payload,
    });

  it('le patient invite : 201, code montré une fois, rien de personnel dans le journal', async () => {
    const { app, lignes } = await monterProches();
    const r = await inviter(app, 'patient');
    expect(r.statusCode).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    const corps = r.json<{ code: string; sms: string }>();
    expect(corps.sms).toBe('envoyee');
    const journal = lignes.join('\n');
    for (const secret of [corps.code, 'Serge', '+33000000000']) {
      expect(journal).not.toContain(secret);
    }
    const liste = await app.inject({
      method: 'GET',
      url: '/proches',
      headers: { authorization: 'Bearer patient' },
    });
    expect(liste.json<{ proches: unknown[] }>().proches).toHaveLength(1);
  });

  it('401 sans jeton ; 403 pour un médecin ; 400 pour un numéro local ou un champ inconnu', async () => {
    const { app } = await monterProches();
    expect((await inviter(app, undefined)).statusCode).toBe(401);
    expect((await inviter(app, 'medecin')).statusCode).toBe(403);
    expect(
      (await inviter(app, 'patient', { ...demande, telephone: '00 00 00 00' })).statusCode,
    ).toBe(400);
    expect((await inviter(app, 'patient', { ...demande, lien: 'VOISIN' })).statusCode).toBe(400);
    expect((await inviter(app, 'patient', { ...demande, nom: '[FICTIF]' })).statusCode).toBe(400);
  });
});

describe('API de l’équipe d’assistance (ADR-0019)', () => {
  async function monter(tropDEssais = false) {
    const appels: unknown[] = [];
    const lignes: string[] = [];
    const app = await creerServeur({
      verifierJeton: async (j) => {
        if (j === 'assistant') return { sujet: 'u-assist', roles: ['assistance-patient'] };
        const u = UTILISATEURS[j];
        if (!u) throw new Error('jeton invalide');
        return u;
      },
      service: new ServiceInvitations(new DepotMemoire(), creerEmpreinte('essai-'.repeat(8)), {
        cohortes: ['ville-fictive'],
        quotaParCohorte: 100,
        validiteJours: 14,
      }),
      limiteur: new LimiteurMemoire(10, 60_000),
      journal: creerJournal({ service: 'invitations', ecrire: (l) => lignes.push(l) }),
      // Le service est testé à part (assistance.test.ts) : ici, la route et ses contrôles.
      assistance: {
        rechercher: async (_u: Utilisateur, d: unknown) => {
          appels.push(d);
          return { patientId: 'pat-fictif-001', telephone: '+241 00 00 00 01', proches: 1 };
        },
        retirerProches: async (_u: Utilisateur, jeton: string, d: unknown) => {
          if (tropDEssais) {
            throw new ErreurProche(429, 'Trop d’essais. Réessayez plus tard.', 'trop-d-essais');
          }
          appels.push({ jeton, d });
          return { retires: 1, sms: 'envoyee' as const };
        },
        creerCodeRecuperation: async (_u: Utilisateur, d: unknown) => {
          appels.push(d);
          return { code: 'ABCD-EFGH', expireLe: '2026-10-02T08:00:00.000Z' };
        },
        utiliserCodeRecuperation: async (d: { code: string }) => {
          appels.push(d);
          return d.code === 'ABCD-EFGH'
            ? { utilise: true, sms: 'envoyee' as const }
            : { utilise: false };
        },
      } as unknown as ServiceAssistance,
      // Jeton factice de l'extension Keycloak ; tout autre jeton est refusé.
      verifierService: async (j) => {
        if (j !== 'extension') throw new Error('jeton de service invalide');
        return 'mbolo-keycloak-inscription';
      },
    });
    return { app, appels, lignes };
  }
  const post = (
    app: Awaited<ReturnType<typeof monter>>['app'],
    url: string,
    payload: object,
    jeton?: string,
  ) =>
    app.inject({
      method: 'POST',
      url,
      payload,
      headers: jeton ? { authorization: `Bearer ${jeton}` } : {},
    });

  it('signale à la supervision un essai de date de naissance bloqué, sans la date', async () => {
    const { app, lignes } = await monter(true);
    const r = await post(
      app,
      '/assistance/retrait-proches',
      { patientId: 'pat-fictif-001', naissance: '1990-01-01', rappel: true },
      'assistant',
    );
    expect(r.statusCode).toBe(429);
    const alertes = lignes
      .map((l) => JSON.parse(l) as { contexte?: { alerte?: string; verification?: string } })
      .filter((l) => l.contexte?.alerte === 'essais-bloques');
    expect(alertes).toHaveLength(1);
    expect(alertes[0]?.contexte?.verification).toBe('naissance');
    expect(lignes.join('\n')).not.toContain('1990-01-01');
  });

  it('recherche et retrait : contrôles de la requête, rien de personnel dans le journal', async () => {
    const { app, appels, lignes } = await monter();
    const recherche = { type: 'assurance-maladie', numero: 'FICTIF-0001' };
    expect((await post(app, '/assistance/recherche', recherche)).statusCode).toBe(401);
    expect(
      (await post(app, '/assistance/recherche', { ...recherche, type: 'autre' }, 'assistant'))
        .statusCode,
    ).toBe(400);
    const r = await post(app, '/assistance/recherche', recherche, 'assistant');
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    const retrait = { patientId: 'pat-fictif-001', naissance: '1990-01-01', rappel: true };
    // Le rappel au numéro du dossier doit être confirmé ; pas de champ en plus.
    for (const corps of [
      { ...retrait, rappel: false },
      { ...retrait, naissance: '01/01/1990' },
      { ...retrait, telephone: '+33000000009' },
    ]) {
      expect((await post(app, '/assistance/retrait-proches', corps, 'assistant')).statusCode).toBe(
        400,
      );
    }
    const ok = await post(app, '/assistance/retrait-proches', retrait, 'assistant');
    expect(ok.json()).toEqual({ retires: 1, sms: 'envoyee' });
    expect(appels).toHaveLength(2);
    // Le jeton du membre de l'équipe est transmis (retrait des partages par identite).
    expect(appels[1]).toMatchObject({ jeton: 'assistant' });
    const journal = lignes.join('\n');
    for (const interdit of ['FICTIF-0001', '+241', '1990-01-01']) {
      expect(journal).not.toContain(interdit);
    }
  });

  it('récupération (ADR-0021) : code remis une fois, sans cache, jamais journalisé', async () => {
    const { app, lignes } = await monter();
    const demande = {
      patientId: 'pat-fictif-001',
      naissance: '1990-01-01',
      type: 'assurance-maladie',
      numero: 'FICTIF-0001',
      rappel: true,
    };
    expect((await post(app, '/assistance/recuperation', demande)).statusCode).toBe(401);
    for (const corps of [
      { ...demande, rappel: false },
      { ...demande, numero: 'FICTIF 0001; drop' },
      { ...demande, telephone: '+33000000009' },
    ]) {
      expect((await post(app, '/assistance/recuperation', corps, 'assistant')).statusCode).toBe(
        400,
      );
    }
    const r = await post(app, '/assistance/recuperation', demande, 'assistant');
    expect(r.statusCode).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json()).toEqual({ code: 'ABCD-EFGH', expireLe: '2026-10-02T08:00:00.000Z' });
    const journal = lignes.join('\n');
    for (const interdit of ['ABCD-EFGH', 'FICTIF-0001', '1990-01-01']) {
      expect(journal).not.toContain(interdit);
    }
  });

  it('récupération : seule l’extension Keycloak utilise un code, même réponse pour tout refus', async () => {
    const { app, lignes } = await monter();
    const corps = {
      code: 'ABCD-EFGH',
      sujet: 'u-p1',
      patientId: 'pat-fictif-001',
      adresse: '192.0.2.1',
    };
    for (const jeton of [undefined, 'assistant', 'patient']) {
      expect((await post(app, '/recuperation/utilisation', corps, jeton)).statusCode).toBe(401);
    }
    const refus = await post(
      app,
      '/recuperation/utilisation',
      { ...corps, code: 'ZZZZ-ZZZZ' },
      'extension',
    );
    expect(refus.statusCode).toBe(409);
    expect(refus.json()).toEqual({ erreur: 'Code non reconnu.', motif: 'code-non-reconnu' });
    const ok = await post(app, '/recuperation/utilisation', corps, 'extension');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ utilise: true });
    expect(lignes.join('\n')).not.toContain('ABCD-EFGH');
  });
});
