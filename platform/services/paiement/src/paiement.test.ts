// Tests unitaires : grille de prix, signature des notifications, service et API (données FICTIVES).
import type { Utilisateur } from '@mbolo/identite';
import { creerJournal, type Evenement } from '@mbolo/journal-securise';
import { describe, expect, it } from 'vitest';
import { DepotMemoire } from './depot.js';
import { FournisseurSimule, LIBELLE, signer, verifierSignature } from './fournisseur.js';
import { creerServeur } from './serveur.js';
import { ServicePaiement } from './service.js';
import { normaliserNumero, tarifsDepuis, type Tarifs } from './tarifs.js';

// [FICTIF] Secret de test construit à l'exécution (jamais une vraie valeur).
const SECRET = ['essai', 'signature', 'fictive', 'paiement'].join('-').padEnd(40, 'x');
// [FICTIF] Numéro manifestement inventé.
const NUMERO = '+241 00 00 00 00';

const TARIFS: Tarifs = {
  devise: 'XAF',
  prix: { generaliste: 10_000, specialiste: 15_000 },
  operateurs: ['airtel', 'moov'],
  indicatif: '241',
};

const COMPTES: Record<string, Utilisateur> = {
  patient: { sujet: 'u-p1', roles: ['patient'], patientId: 'pat-fictif-001' },
  autre: { sujet: 'u-p2', roles: ['patient'], patientId: 'pat-fictif-002' },
  ferme: { sujet: 'u-p3', roles: ['patient'], patientId: 'pat-fictif-003' },
  agent: {
    sujet: 'u-agent',
    roles: ['agent-ia', 'patient'],
    agent: { nom: 'agent-01-accueil', patientSession: 'pat-fictif-001' },
  },
  medecin: { sujet: 'u-m1', roles: ['professionnel'], practitionerId: 'prac-fictif-001' },
};

async function monter(o: { collecteParMinute?: number; simulation?: boolean } = {}) {
  const evenements: Evenement[] = [];
  const fournisseur = new FournisseurSimule(SECRET);
  const depot = new DepotMemoire();
  const service = new ServicePaiement(
    depot,
    fournisseur,
    TARIFS,
    // Flag paiement.mobile-money : ouvert à tous sauf au compte « ferme ».
    { estActif: async (_nom, ctx) => ctx?.sujet !== 'u-p3' },
  );
  const app = await creerServeur({
    verifierJeton: async (j) => {
      const u = COMPTES[j];
      if (!u) throw new Error('jeton invalide');
      return u;
    },
    verifierAppelant: async (j) => {
      if (j !== 'service-teleconsultation') throw new Error('client non autorisé');
      return 'mbolo-teleconsultation-service';
    },
    service,
    journal: creerJournal({
      service: 'paiement',
      ecrire: (ligne) => evenements.push(JSON.parse(ligne) as Evenement),
    }),
    limites: { parMinute: 1_000, collecteParMinute: o.collecteParMinute ?? 100 },
    ...(o.simulation ? { simulation: fournisseur } : {}),
  });
  const creer = async (reference = 'rdv-fictif-001', sujet = 'u-p1', type = 'generaliste') =>
    app.inject({
      method: 'POST',
      url: '/paiements',
      headers: { authorization: 'Bearer service-teleconsultation' },
      payload: { reference, sujet, type },
    });
  const collecter = (id: string, compte = 'patient', corps: object = {}) =>
    app.inject({
      method: 'POST',
      url: `/paiements/${id}/collecte`,
      headers: { authorization: `Bearer ${compte}` },
      payload: { operateur: 'airtel', numero: NUMERO, ...corps },
    });
  const lire = (id: string, compte = 'patient') =>
    app.inject({
      method: 'GET',
      url: `/paiements/${id}`,
      headers: { authorization: `Bearer ${compte}` },
    });
  const notifier = (corps: Buffer, signature: string) =>
    app.inject({
      method: 'POST',
      url: '/notifications/prestataire',
      headers: { 'content-type': 'application/json', 'x-signature': signature },
      payload: corps,
    });
  const estPaye = async (reference = 'rdv-fictif-001') =>
    (
      await app.inject({
        method: 'GET',
        url: `/rendez-vous/${reference}/paiement`,
        headers: { authorization: 'Bearer service-teleconsultation' },
      })
    ).json<{ paye: boolean }>().paye;
  return { app, fournisseur, depot, evenements, creer, collecter, lire, notifier, estPaye };
}

describe('grille de prix du pays', () => {
  it('lit la grille du déploiement et refuse une grille invalide', () => {
    const env = {
      PAIEMENT_DEVISE: 'XAF',
      PAIEMENT_PRIX: '{"generaliste":10000,"specialiste":15000}',
      PAIEMENT_OPERATEURS: 'airtel, moov',
      PAIEMENT_INDICATIF: '241',
    };
    expect(tarifsDepuis(env)).toEqual(TARIFS);
    expect(() => tarifsDepuis({ ...env, PAIEMENT_DEVISE: 'fcfa' })).toThrow(/Devise/);
    expect(() => tarifsDepuis({ ...env, PAIEMENT_PRIX: '{"generaliste":10000}' })).toThrow(
      /specialiste/,
    );
    expect(() =>
      tarifsDepuis({ ...env, PAIEMENT_PRIX: '{"generaliste":-5,"specialiste":1}' }),
    ).toThrow(/generaliste/);
    expect(() => tarifsDepuis({ ...env, PAIEMENT_OPERATEURS: '' })).toThrow(/Opérateurs/);
  });

  it('accepte seulement un numéro international du pays déployé', () => {
    expect(normaliserNumero(NUMERO, '241')).toBe('+24100000000');
    expect(normaliserNumero('00 00 00 00', '241')).toBeUndefined();
    expect(normaliserNumero('+33 0 00 00 00 00', '241')).toBeUndefined();
    expect(normaliserNumero('+241 00 00 00 00; drop', '241')).toBeUndefined();
  });
});

describe('signature des notifications', () => {
  const corps = Buffer.from('{"tentative":"t-fictive"}');
  const maintenant = new Date('2026-09-28T10:00:00Z');
  const t = Math.floor(maintenant.getTime() / 1000);

  it('accepte une signature valide et récente', () => {
    expect(verifierSignature(SECRET, corps, signer(SECRET, corps, t), maintenant)).toBe(true);
  });

  it('refuse un corps modifié, un autre secret, un rejeu ancien ou un format inconnu', () => {
    const s = signer(SECRET, corps, t);
    expect(verifierSignature(SECRET, Buffer.from('{"tentative":"x"}'), s, maintenant)).toBe(false);
    expect(verifierSignature(`${SECRET}y`, corps, s, maintenant)).toBe(false);
    const ancienne = signer(SECRET, corps, t - 600);
    expect(verifierSignature(SECRET, corps, ancienne, maintenant)).toBe(false);
    expect(verifierSignature(SECRET, corps, 'sha256=abc', maintenant)).toBe(false);
    expect(verifierSignature(SECRET, corps, undefined, maintenant)).toBe(false);
  });
});

describe('API de paiement', () => {
  it('parcours nominal : montant de la grille, collecte, confirmation relue chez le prestataire', async () => {
    const m = await monter();
    const cree = await m.creer();
    expect(cree.statusCode).toBe(201);
    const p = cree.json<{ id: string; montant: number; devise: string; statut: string }>();
    expect(p).toMatchObject({ montant: 10_000, devise: 'XAF', statut: 'a-payer' });

    const c = await m.collecter(p.id);
    expect(c.statusCode).toBe(202);
    expect(c.json()).toMatchObject({ statut: 'en-attente', operateur: 'airtel' });
    const [tentative, demande] = [...m.fournisseur.tentatives.entries()][0] ?? [];
    expect(demande).toEqual({
      resultat: 'en-attente',
      montant: 10_000,
      devise: 'XAF',
      libelle: LIBELLE,
    });
    expect(await m.estPaye()).toBe(false);

    const { corps, signature } = m.fournisseur.conclure(tentative ?? '', 'reussi');
    expect((await m.notifier(corps, signature)).statusCode).toBe(204);
    expect((await m.lire(p.id)).json()).toMatchObject({ statut: 'paye', montant: 10_000 });
    expect(await m.estPaye()).toBe(true);
  });

  it('le montant vient de la grille : consultation spécialisée, et création idempotente', async () => {
    const m = await monter();
    const a = (await m.creer('rdv-fictif-002', 'u-p1', 'specialiste')).json<{ id: string }>();
    const b = (await m.creer('rdv-fictif-002', 'u-p1', 'specialiste')).json<{ id: string }>();
    expect(b.id).toBe(a.id);
    expect(m.depot.paiements).toHaveLength(1);
    expect(m.depot.paiements[0]?.montant).toBe(15_000);
    // Une référence déjà liée à un patient ne passe jamais à un autre.
    expect((await m.creer('rdv-fictif-002', 'u-p2', 'specialiste')).statusCode).toBe(403);
  });

  it('refuse un montant envoyé par l’appelant et un appelant non autorisé', async () => {
    const m = await monter();
    const avecMontant = await m.app.inject({
      method: 'POST',
      url: '/paiements',
      headers: { authorization: 'Bearer service-teleconsultation' },
      payload: { reference: 'rdv-fictif-003', sujet: 'u-p1', type: 'generaliste', montant: 1 },
    });
    expect(avecMontant.statusCode).toBe(400);
    const patient = await m.app.inject({
      method: 'POST',
      url: '/paiements',
      headers: { authorization: 'Bearer patient' },
      payload: { reference: 'rdv-fictif-003', sujet: 'u-p1', type: 'generaliste' },
    });
    expect(patient.statusCode).toBe(401);
    expect(m.depot.paiements).toHaveLength(0);
  });

  it('paiement refusé par le payeur : échec, puis nouvel essai avec une autre tentative', async () => {
    const m = await monter();
    const { id } = (await m.creer()).json<{ id: string }>();
    await m.collecter(id);
    const [premiere] = [...m.fournisseur.tentatives.keys()];
    const refus = m.fournisseur.conclure(premiere ?? '', 'echoue');
    await m.notifier(refus.corps, refus.signature);
    expect((await m.lire(id)).json()).toMatchObject({ statut: 'echoue' });

    expect((await m.collecter(id, 'patient', { operateur: 'moov' })).statusCode).toBe(202);
    const tentatives = [...m.fournisseur.tentatives.keys()];
    expect(tentatives).toHaveLength(2);
    expect(tentatives[1]).not.toBe(premiere);
  });

  it('une seule collecte à la fois, et jamais sur un paiement déjà payé', async () => {
    const m = await monter();
    const { id } = (await m.creer()).json<{ id: string }>();
    const [a, b] = await Promise.all([m.collecter(id), m.collecter(id)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([202, 409]);
    expect(m.fournisseur.tentatives.size).toBe(1);
    const [t] = [...m.fournisseur.tentatives.keys()];
    m.fournisseur.conclure(t ?? '', 'reussi');
    // Sans notification : la lecture relit le statut chez le prestataire.
    expect((await m.lire(id)).json()).toMatchObject({ statut: 'paye' });
    const encore = await m.collecter(id);
    expect(encore.statusCode).toBe(409);
    expect(encore.json()).toMatchObject({ motif: 'deja-paye' });
  });

  it('refuse une notification non signée ou falsifiée, sans rien changer', async () => {
    const m = await monter();
    const { id } = (await m.creer()).json<{ id: string }>();
    await m.collecter(id);
    const [t] = [...m.fournisseur.tentatives.keys()];
    const faux = Buffer.from(JSON.stringify({ tentative: t, resultat: 'reussi' }));
    const r = await m.notifier(faux, 't=1,v1=' + '0'.repeat(64));
    expect(r.statusCode).toBe(401);
    // Une notification signée qui prétend « réussi » ne suffit pas : le prestataire dit « en attente ».
    const signee = signer(SECRET, faux, Math.floor(Date.now() / 1000));
    expect((await m.notifier(faux, signee)).statusCode).toBe(204);
    expect((await m.lire(id)).json()).toMatchObject({ statut: 'en-attente' });
    expect(m.evenements.some((e) => e.message.includes('signature invalide'))).toBe(true);
  });

  it('le patient ne voit que son paiement ; un agent IA ou un professionnel ne paie jamais', async () => {
    const m = await monter();
    const { id } = (await m.creer()).json<{ id: string }>();
    expect((await m.lire(id, 'autre')).statusCode).toBe(404);
    expect((await m.collecter(id, 'autre')).statusCode).toBe(404);
    expect((await m.collecter(id, 'agent')).statusCode).toBe(403);
    expect((await m.collecter(id, 'medecin')).statusCode).toBe(403);
    expect((await m.lire(id, 'inconnu')).statusCode).toBe(401);
    expect(m.fournisseur.tentatives.size).toBe(0);
  });

  it('refuse un opérateur non proposé ou un numéro d’un autre pays', async () => {
    const m = await monter();
    const { id } = (await m.creer()).json<{ id: string }>();
    const op = await m.collecter(id, 'patient', { operateur: 'orange' });
    expect(op.json()).toMatchObject({ motif: 'operateur' });
    const num = await m.collecter(id, 'patient', { numero: '+33 0 00 00 00 00' });
    expect(num.json()).toMatchObject({ motif: 'numero' });
    expect(m.fournisseur.tentatives.size).toBe(0);
  });

  it('flag paiement.mobile-money fermé : ni création ni collecte', async () => {
    const m = await monter();
    const r = await m.creer('rdv-fictif-004', 'u-p3');
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ motif: 'desactive' });
  });

  it('prestataire injoignable : 503 et alerte, le patient peut réessayer', async () => {
    const m = await monter();
    const { id } = (await m.creer()).json<{ id: string }>();
    m.fournisseur.indisponible = true;
    expect((await m.collecter(id)).statusCode).toBe(503);
    expect(
      m.evenements.some(
        (e) => (e.contexte as { alerte?: string } | undefined)?.alerte === 'erreur-serveur',
      ),
    ).toBe(true);
    m.fournisseur.indisponible = false;
    expect((await m.lire(id)).json()).toMatchObject({ statut: 'echoue' });
    expect((await m.collecter(id)).statusCode).toBe(202);
  });

  it('ne journalise jamais le numéro du payeur, et limite les collectes', async () => {
    const m = await monter({ collecteParMinute: 2 });
    const { id } = (await m.creer()).json<{ id: string }>();
    await m.collecter(id);
    await m.collecter(id);
    expect((await m.collecter(id)).statusCode).toBe(429);
    const journal = JSON.stringify(m.evenements);
    expect(journal).not.toMatch(/00 ?00 ?00 ?00|24100000000/);
    expect(JSON.stringify(m.depot.paiements)).not.toContain('24100000000');
  });

  it('simulation du payeur (développement) : absente par défaut, conclut par le chemin signé', async () => {
    const sans = await monter();
    const { id: id1 } = (await sans.creer()).json<{ id: string }>();
    await sans.collecter(id1);
    const absente = await sans.app.inject({
      method: 'POST',
      url: `/simulation/paiements/${id1}/conclusion`,
      payload: { resultat: 'reussi' },
    });
    expect(absente.statusCode).toBe(404);
    expect((await sans.lire(id1)).json()).toMatchObject({ statut: 'en-attente' });

    const m = await monter({ simulation: true });
    const { id } = (await m.creer()).json<{ id: string }>();
    const conclure = () =>
      m.app.inject({
        method: 'POST',
        url: `/simulation/paiements/${id}/conclusion`,
        payload: { resultat: 'reussi' },
      });
    // Pas de collecte en cours : rien à conclure.
    expect((await conclure()).statusCode).toBe(404);
    await m.collecter(id);
    const r = await conclure();
    expect(r.json()).toEqual({ statut: 'paye' });
    expect(await m.estPaye()).toBe(true);
  });
});
