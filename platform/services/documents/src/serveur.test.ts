import { consentement, type StatutIdentite } from '@mbolo/dossier-fhir';
import type { Utilisateur } from '@mbolo/identite';
import { creerJournal, type Evenement } from '@mbolo/journal-securise';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CleMaitreLocale } from './chiffrement.js';
import { ConditionsMemoire, charteAcceptee } from './conditions.js';
import { DepotMemoire } from './depot.js';
import { creerServeur } from './serveur.js';
import { ServiceDocuments } from './service.js';
import { StockageMemoire } from './stockage.js';
import { ServiceVerification } from './verification.js';

// Données FICTIVES. Jetons factices : la vérification réelle (signature Keycloak) est testée dans
// @mbolo/identite.
const COMPTES: Record<string, Utilisateur> = {
  patient: { sujet: 'u-p3', roles: ['patient'], patientId: 'pat-fictif-003' },
  verifie: { sujet: 'u-p1', roles: ['patient'], patientId: 'pat-fictif-001' },
  hors: { sujet: 'u-p2', roles: ['patient'], patientId: 'pat-fictif-002' },
  agent: {
    sujet: 'u-agent',
    roles: ['agent-ia'],
    agent: { nom: 'agent-01-accueil', patientSession: 'pat-fictif-003' },
  },
  medecin: { sujet: 'u-m1', roles: ['professionnel'], practitionerId: 'prac-fictif-001' },
};

const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(500)]);

const charte = (patientId: string, version: string, accepte: boolean, date: string) => ({
  ...consentement({
    patientId,
    categorie: 'C-IDENTITE',
    mode: 'texte',
    date,
    versionTexte: version,
    accepte,
    env: 'dev',
  }),
  id: `c-${patientId}-${date}`,
});

async function monter(o: { chartes?: ReturnType<typeof charte>[]; limites?: object } = {}) {
  const evenements: Evenement[] = [];
  const stockage = new StockageMemoire();
  const conditions = new ConditionsMemoire(
    new Map<string, StatutIdentite>([
      ['pat-fictif-003', 'a-verifier'],
      ['pat-fictif-001', 'verifiee'],
      ['pat-fictif-002', 'a-verifier'],
    ]),
    o.chartes ?? [charte('pat-fictif-003', '0.1', true, '2026-09-27T08:00:00Z')],
  );
  const verification = new ServiceVerification(
    new ServiceDocuments(
      new DepotMemoire(),
      stockage,
      new CleMaitreLocale(randomBytes(32).toString('base64')),
      {
        conservationJours: 90,
        maxParType: 2,
      },
    ),
    conditions,
    // Flag identite.photos : ouvert à tous sauf au compte « hors ».
    { estActif: async (_nom, ctx) => ctx?.sujet !== 'u-p2' },
    '0.1',
  );
  const app = await creerServeur({
    verifierJeton: async (j) => {
      const u = COMPTES[j];
      if (!u) throw new Error('jeton invalide');
      return u;
    },
    verification,
    journal: creerJournal({
      service: 'documents',
      ecrire: (ligne) => evenements.push(JSON.parse(ligne) as Evenement),
    }),
    ...(o.limites ? { limites: o.limites as never } : {}),
  });
  return { app, stockage, evenements };
}

const envoyer = (
  app: Awaited<ReturnType<typeof monter>>['app'],
  compte: string,
  type: string,
  corps: Buffer,
  contentType = 'image/jpeg',
) =>
  app.inject({
    method: 'POST',
    url: `/verification/documents/${type}`,
    headers: { authorization: `Bearer ${compte}`, 'content-type': contentType },
    payload: corps,
  });

describe('charte de vérification d’identité', () => {
  const p = 'pat-fictif-003';
  it('la dernière décision active compte, dans la version en vigueur', () => {
    const accord = charte(p, '0.1', true, '2026-09-27T08:00:00Z');
    const refus = charte(p, '0.1', false, '2026-09-27T09:00:00Z');
    expect(charteAcceptee([accord], p, '0.1')).toBe(true);
    expect(charteAcceptee([accord, refus], p, '0.1')).toBe(false);
    expect(charteAcceptee([accord], p, '0.2')).toBe(false);
    expect(charteAcceptee([{ ...accord, status: 'inactive' }], p, '0.1')).toBe(false);
    expect(charteAcceptee([accord], 'pat-fictif-autre', '0.1')).toBe(false);
  });
});

describe('API documents : dépôt des photos par le patient', () => {
  it('le patient voit l’état de son parcours, sans contenu de photo', async () => {
    const { app } = await monter();
    expect((await envoyer(app, 'patient', 'visage', jpeg())).statusCode).toBe(201);
    const r = await app.inject({
      method: 'GET',
      url: '/verification',
      headers: { authorization: 'Bearer patient' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      patientId: 'pat-fictif-003',
      statut: 'a-verifier',
      charte: { version: '0.1', acceptee: true },
      documents: [{ type: 'visage' }],
    });
    expect(Object.keys(r.json().documents[0] as object).sort()).toEqual(['deposeLe', 'type']);
  });

  it('dépose une photo chiffrée et trace le dépôt, sans image ni nom dans le journal', async () => {
    const { app, stockage, evenements } = await monter();
    const photo = jpeg();
    const r = await envoyer(app, 'patient', 'piece-identite', photo);
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({ type: 'piece-identite', format: 'image/jpeg' });
    const [objet] = stockage.objets.values();
    expect(objet?.includes(photo.subarray(4, 64))).toBe(false);
    const trace = evenements.find((e) => e.message === 'photo déposée');
    expect(trace?.contexte).toMatchObject({ sujet: 'u-p3', type: 'piece-identite' });
    expect(JSON.stringify(evenements)).not.toContain(photo.subarray(4, 32).toString('base64'));
  });

  it('refuse sans charte acceptée, ou si la dernière décision est un refus', async () => {
    const sans = await monter({ chartes: [] });
    const r = await envoyer(sans.app, 'patient', 'visage', jpeg());
    expect(r.statusCode).toBe(403);
    expect(r.json().erreur).toMatch(/charte/);
    expect(sans.stockage.objets.size).toBe(0);
    const refus = await monter({
      chartes: [
        charte('pat-fictif-003', '0.1', true, '2026-09-27T08:00:00Z'),
        charte('pat-fictif-003', '0.1', false, '2026-09-27T09:00:00Z'),
      ],
    });
    expect((await envoyer(refus.app, 'patient', 'visage', jpeg())).statusCode).toBe(403);
  });

  it('refuse si l’identité est déjà vérifiée', async () => {
    const { app } = await monter({
      chartes: [charte('pat-fictif-001', '0.1', true, '2026-09-27T08:00:00Z')],
    });
    const r = await envoyer(app, 'verifie', 'visage', jpeg());
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ erreur: 'Votre identité est déjà vérifiée.' });
  });

  it('seul le patient lui-même dépose : ni agent IA, ni professionnel ; flag requis', async () => {
    const { app } = await monter();
    expect((await envoyer(app, 'agent', 'visage', jpeg())).statusCode).toBe(403);
    expect((await envoyer(app, 'medecin', 'visage', jpeg())).statusCode).toBe(403);
    const hors = await envoyer(app, 'hors', 'visage', jpeg());
    expect(hors.statusCode).toBe(403);
    expect(hors.json()).toEqual({ erreur: 'Fonction non disponible.' });
    expect((await envoyer(app, 'inconnu', 'visage', jpeg())).statusCode).toBe(401);
  });

  it('refuse un contenu qui n’est pas une photo, même annoncé comme JPEG', async () => {
    const { app, stockage } = await monter();
    const texte = Buffer.from('%PDF-1.7 [FICTIF] pas une photo');
    expect((await envoyer(app, 'patient', 'visage', texte)).statusCode).toBe(415);
    expect((await envoyer(app, 'patient', 'visage', texte, 'application/pdf')).statusCode).toBe(
      415,
    );
    expect((await envoyer(app, 'patient', 'passeport', jpeg())).statusCode).toBe(400);
    expect(stockage.objets.size).toBe(0);
  });

  it('refuse une photo trop lourde et au-delà de deux photos par type', async () => {
    const { app } = await monter();
    const lourde = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2_100_000)]);
    expect((await envoyer(app, 'patient', 'visage', lourde)).statusCode).toBe(413);
    expect((await envoyer(app, 'patient', 'visage', jpeg())).statusCode).toBe(201);
    expect((await envoyer(app, 'patient', 'visage', jpeg())).statusCode).toBe(201);
    expect((await envoyer(app, 'patient', 'visage', jpeg())).statusCode).toBe(409);
  });

  it('limite les envois de photos par minute', async () => {
    const { app } = await monter({ limites: { parMinute: 50, depotParMinute: 2 } });
    await envoyer(app, 'patient', 'visage', jpeg());
    await envoyer(app, 'patient', 'visage', jpeg());
    expect((await envoyer(app, 'patient', 'visage', jpeg())).statusCode).toBe(429);
  });
});
