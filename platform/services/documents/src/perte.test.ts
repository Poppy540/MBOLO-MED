import {
  EXTENSION_CHANGEMENT_TELEPHONE,
  EXTENSION_STATUT_IDENTITE,
  consentement,
  patientInscrit,
  type StatutIdentite,
} from '@mbolo/dossier-fhir';
import type { Utilisateur } from '@mbolo/identite';
import { creerJournal } from '@mbolo/journal-securise';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CleMaitreLocale } from './chiffrement.js';
import { ConditionsMemoire } from './conditions.js';
import { DepotMemoire } from './depot.js';
import { DossierMemoire } from './dossier.js';
import { ServicePerte, type AlerteNumero } from './perte.js';
import { creerServeur } from './serveur.js';
import { ServiceDocuments } from './service.js';
import { StockageMemoire } from './stockage.js';
import { ServiceVerification } from './verification.js';
import { ServiceVerificateur } from './verificateur.js';

// Données FICTIVES : numéros manifestement inventés, jetons factices (la signature des jetons est
// testée dans @mbolo/identite).
const NOUVEAU = '+241 00 00 00 08';
const ANCIEN = '+241 00 00 00 01';
const COMPTES: Record<string, Utilisateur> = {
  patient: { sujet: 'u-p1', roles: ['patient'], patientId: 'pat-fictif-001' },
  verificateur: { sujet: 'u-v1', roles: ['verification-identite'] },
  soiMeme: {
    sujet: 'u-v2',
    roles: ['verification-identite', 'patient'],
    patientId: 'pat-fictif-001',
  },
  agent: { sujet: 'u-a', roles: ['agent-ia', 'verification-identite'] },
};

const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(500)]);

async function monter(o: { alerte?: AlerteNumero['numeroChange'] } = {}) {
  const lignes: string[] = [];
  let t = new Date('2026-09-30T08:00:00Z').getTime();
  const horloge = () => new Date((t += 1_000));
  const depot = new DepotMemoire();
  const maitre = new CleMaitreLocale(randomBytes(32).toString('base64'));
  const documents = new ServiceDocuments(
    depot,
    new StockageMemoire(),
    maitre,
    { conservationJours: 90, maxParType: 2 },
    horloge,
  );
  const p = patientInscrit({
    nom: 'Fictif',
    prenom: 'Awa',
    naissance: '1990-01-01',
    telephone: ANCIEN,
    env: 'dev',
  });
  const verifie = {
    ...p,
    id: 'pat-fictif-001',
    extension: [{ url: EXTENSION_STATUT_IDENTITE, valueCode: 'verifiee' }],
  };
  const dossier = new DossierMemoire(new Map([['pat-fictif-001', verifie]]));
  const verificateur = new ServiceVerificateur(
    documents,
    depot,
    dossier,
    {
      systemes: {
        'assurance-maladie': 'https://mbolo-sante.example/fhir/identifiant/xx/assurance-maladie',
        provisoire: 'https://mbolo-sante.example/fhir/identifiant/xx/provisoire',
      },
      env: 'dev',
    },
    horloge,
  );
  const ordre: string[] = [];
  const alerte: AlerteNumero = {
    numeroChange: async (id) => {
      // L'alerte part pendant que le dossier porte encore l'ancien numéro.
      ordre.push(`alerte:${(await dossier.patient(id))?.telecom?.[0]?.value ?? ''}`);
      return o.alerte ? o.alerte(id) : 'envoyee';
    },
  };
  const perte = new ServicePerte(documents, depot, dossier, verificateur, alerte, maitre, horloge);
  const conditions = new ConditionsMemoire(
    new Map<string, StatutIdentite>([['pat-fictif-001', 'verifiee']]),
    [
      {
        ...consentement({
          patientId: 'pat-fictif-001',
          categorie: 'C-IDENTITE',
          mode: 'texte',
          date: '2026-09-27T08:00:00Z',
          versionTexte: '0.1',
          accepte: true,
          env: 'dev',
        }),
        id: 'c-1',
      },
    ],
  );
  const app = await creerServeur({
    verifierJeton: async (j) => {
      const u = COMPTES[j];
      if (!u) throw new Error('jeton invalide');
      return u;
    },
    verification: new ServiceVerification(
      documents,
      conditions,
      { estActif: async () => true },
      '0.1',
      depot,
    ),
    verificateur,
    perte: {
      service: perte,
      verifierAppelant: async (j) => {
        if (j === 'jeton-keycloak') return 'mbolo-keycloak-inscription';
        throw new Error('refusé');
      },
    },
    journal: creerJournal({ service: 'documents', ecrire: (l) => lignes.push(l) }),
  });
  const photo = (type: string) =>
    app.inject({
      method: 'POST',
      url: `/verification/documents/${type}`,
      headers: { authorization: 'Bearer patient', 'content-type': 'image/jpeg' },
      payload: jpeg(),
    });
  const ouvrir = (jeton = 'jeton-keycloak', telephone = NOUVEAU) =>
    app.inject({
      method: 'POST',
      url: '/demandes-perte',
      headers: { authorization: `Bearer ${jeton}` },
      payload: { patientId: 'pat-fictif-001', telephone },
    });
  const decider = (compte: string, payload: object) =>
    app.inject({
      method: 'POST',
      url: '/demandes-perte/pat-fictif-001/decision',
      headers: { authorization: `Bearer ${compte}` },
      payload,
    });
  return { app, depot, dossier, lignes, ordre, photo, ouvrir, decider };
}

describe('téléphone perdu (ADR-0023)', () => {
  it('seule l’extension Keycloak ouvre une demande ; une seule à la fois ; le numéro est chiffré', async () => {
    const { ouvrir, depot, lignes } = await monter();
    expect((await ouvrir('patient')).statusCode).toBe(401);
    expect((await ouvrir('jeton-keycloak', '0700')).statusCode).toBe(400);
    expect((await ouvrir()).statusCode).toBe(201);
    expect((await ouvrir()).statusCode).toBe(409);
    const [d] = depot.pertes;
    expect(d?.telephoneChiffre?.toString('latin1')).not.toContain('00 00 00 08');
    expect(lignes.join('\n')).not.toContain('00 00 00 08');
  });

  it('nouvelles photos malgré une identité déjà vérifiée ; la limite ne compte que la demande', async () => {
    const { app, photo, ouvrir } = await monter();
    // Sans demande en cours : identité déjà vérifiée, rien à envoyer.
    expect((await photo('visage')).statusCode).toBe(409);
    await ouvrir();
    for (const type of ['piece-identite', 'piece-identite', 'visage']) {
      expect((await photo(type)).statusCode).toBe(201);
    }
    expect((await photo('piece-identite')).statusCode).toBe(409);
    const etat = await app.inject({
      method: 'GET',
      url: '/perte',
      headers: { authorization: 'Bearer patient' },
    });
    expect(etat.json()).toMatchObject({ ouverte: true, photos: expect.any(Array) });
    expect(etat.json().photos).toHaveLength(3);
  });

  it('accepté : alerte à l’ancien numéro, puis nouveau numéro « perte » ; le numéro chiffré est effacé', async () => {
    const { app, photo, ouvrir, decider, dossier, depot, ordre } = await monter();
    await ouvrir();
    expect((await decider('verificateur', { resultat: 'acceptee' })).statusCode).toBe(409);
    await photo('piece-identite');
    await photo('visage');
    const liste = await app.inject({
      method: 'GET',
      url: '/demandes-perte',
      headers: { authorization: 'Bearer verificateur' },
    });
    expect(liste.json().demandes).toEqual([
      { patientId: 'pat-fictif-001', depuis: expect.any(String) },
    ]);
    const fiche = await app.inject({
      method: 'GET',
      url: '/demandes-perte/pat-fictif-001',
      headers: { authorization: 'Bearer verificateur' },
    });
    expect(fiche.json()).toMatchObject({ nom: 'Fictif', naissance: '1990-01-01' });
    expect(fiche.json().nouvelles).toHaveLength(2);
    // Consultation tracée dans le dossier avant d'être montrée.
    expect(dossier.traces).toHaveLength(1);

    expect((await decider('soiMeme', { resultat: 'acceptee' })).statusCode).toBe(403);
    expect((await decider('agent', { resultat: 'acceptee' })).statusCode).toBe(403);
    expect((await decider('verificateur', { resultat: 'refusee' })).statusCode).toBe(422);
    const r = await decider('verificateur', { resultat: 'acceptee' });
    expect(r.statusCode).toBe(201);
    expect(ordre).toEqual([`alerte:${ANCIEN}`]);
    const [numero] = (await dossier.patient('pat-fictif-001'))?.telecom ?? [];
    expect(numero).toMatchObject({
      value: NOUVEAU,
      extension: [{ url: EXTENSION_CHANGEMENT_TELEPHONE, valueCode: 'perte' }],
      period: { start: expect.any(String) },
    });
    expect(depot.pertes[0]).toMatchObject({ resultat: 'acceptee', verificateur: 'u-v1' });
    expect(depot.pertes[0]?.telephoneChiffre).toBeUndefined();
    expect(depot.pertes[0]?.cleEnveloppee).toBeUndefined();
    // Plus de demande en cours : plus de décision possible.
    expect((await decider('verificateur', { resultat: 'acceptee' })).statusCode).toBe(409);
  });

  it('sans alerte à l’ancien numéro, rien ne change ; un refus porte un motif codé', async () => {
    const { photo, ouvrir, decider, dossier, depot } = await monter({
      alerte: async () => 'echec',
    });
    await ouvrir();
    await photo('acte-naissance');
    await photo('visage');
    expect((await decider('verificateur', { resultat: 'acceptee' })).statusCode).toBe(503);
    expect((await dossier.patient('pat-fictif-001'))?.telecom?.[0]?.value).toBe(ANCIEN);
    expect(depot.pertes[0]?.resultat).toBeUndefined();
    const r = await decider('verificateur', { resultat: 'refusee', motif: 'visage-different' });
    expect(r.statusCode).toBe(201);
    expect((await dossier.patient('pat-fictif-001'))?.telecom?.[0]?.value).toBe(ANCIEN);
    expect(depot.pertes[0]).toMatchObject({ resultat: 'refusee', motif: 'visage-different' });
    expect(depot.pertes[0]?.telephoneChiffre).toBeUndefined();
  });
});
