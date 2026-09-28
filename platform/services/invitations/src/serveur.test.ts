import { describe, expect, it } from 'vitest';
import type { Utilisateur } from '@mbolo/identite';
import { creerJournal } from '@mbolo/journal-securise';
import { creerEmpreinte } from './codes.js';
import { DepotMemoire } from './depot.js';
import { Limiteur } from './limiteur.js';
import { creerServeur } from './serveur.js';
import { ServiceProches } from './proches.js';
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
    limiteur: new Limiteur(maxEssais, 60_000),
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

  it('limite les essais de code', async () => {
    const { app } = await serveur(2);
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
      { envoyer: async () => 'envoyee' },
      { estActif: async () => true },
      { max: 3, validiteJours: 7, env: 'dev' },
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
      limiteur: new Limiteur(10, 60_000),
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
