import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { DepotMemoire, ServiceConsentements } from './consentements.js';
import { ErreurDepot } from './depot-fhir.js';
import { JournalAccesMemoire, type JournalAcces } from './journal-acces.js';
import { ServiceRevue } from './revue.js';
import { creerVerificateur } from './jeton.js';
import { creerServeur } from './serveur.js';
import type { Journal } from '@mbolo/journal-securise';

// Clés générées pour le test (aucune clé dans le dépôt) ; données FICTIVES.
const EMETTEUR = 'https://auth.mbolo-sante.example/realms/mbolo';
const AUDIENCE = 'mbolo-identite-api';

let signer: (revendications: Record<string, unknown>, emetteur?: string) => Promise<string>;
let jwks: { keys: JWK[] };
const lignes: { niveau: string; message: string; contexte?: Record<string, unknown> }[] = [];
const journal: Journal = {
  debug: () => undefined,
  info: (message, contexte) =>
    lignes.push({ niveau: 'info', message, ...(contexte ? { contexte } : {}) }),
  avertissement: (message, contexte) =>
    lignes.push({ niveau: 'avertissement', message, ...(contexte ? { contexte } : {}) }),
  erreur: (message, contexte) =>
    lignes.push({ niveau: 'erreur', message, ...(contexte ? { contexte } : {}) }),
};

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256' }] };
  signer = (revendications, emetteur = EMETTEUR) =>
    new SignJWT(revendications)
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(emetteur)
      .setAudience(AUDIENCE)
      .setSubject(String(revendications['sub'] ?? 'u-test'))
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
});

const app = async (
  journalAcces: JournalAcces = new JournalAccesMemoire(),
  limiteParMinute?: number,
) => {
  const depot = new DepotMemoire();
  return creerServeur({
    verifierJeton: creerVerificateur({
      emetteur: EMETTEUR,
      audience: AUDIENCE,
      cles: createLocalJWKSet(jwks),
    }),
    consentements: new ServiceConsentements(depot, 'dev', { estActif: async () => true }),
    depot,
    journalAcces,
    revue: new ServiceRevue(journalAcces, 'dev', 24),
    env: 'dev',
    journal,
    ...(limiteParMinute ? { limiteParMinute } : {}),
  });
};

const jetonPatient = () =>
  signer({ sub: 'u-p1', realm_access: { roles: ['patient'] }, patient_id: 'fictif-patient-0001' });
const jetonMedecin = () =>
  signer({
    sub: 'u-m1',
    realm_access: { roles: ['professionnel'] },
    practitioner_id: 'fictif-medecin-0001',
  });

describe('API identité', () => {
  it('GET /sante sans authentification', async () => {
    const r = await (await app()).inject({ method: 'GET', url: '/sante' });
    expect(r.statusCode).toBe(200);
  });

  it('401 sans jeton, avec un jeton d’un autre émetteur, ou un jeton altéré', async () => {
    const a = await app();
    expect(
      (await a.inject({ method: 'GET', url: '/patients/fictif-patient-0001/consentements' }))
        .statusCode,
    ).toBe(401);
    const etranger = await signer(
      { sub: 'u-p1', realm_access: { roles: ['patient'] }, patient_id: 'fictif-patient-0001' },
      'https://attaquant.example',
    );
    expect(
      (
        await a.inject({
          method: 'GET',
          url: '/patients/fictif-patient-0001/consentements',
          headers: { authorization: `Bearer ${etranger}` },
        })
      ).statusCode,
    ).toBe(401);
    const altere = (await jetonPatient()).slice(0, -4) + 'AAAA';
    expect(
      (
        await a.inject({
          method: 'GET',
          url: '/patients/fictif-patient-0001/consentements',
          headers: { authorization: `Bearer ${altere}` },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('parcours complet : consentement de partage, accès du médecin, révocation, refus', async () => {
    const a = await app();
    const patient = { authorization: `Bearer ${await jetonPatient()}` };
    const medecin = { authorization: `Bearer ${await jetonMedecin()}` };

    // Avant consentement : le médecin est refusé.
    const avant = await a.inject({
      method: 'POST',
      url: '/acces/dossier',
      headers: medecin,
      payload: { patientId: 'fictif-patient-0001' },
    });
    expect(avant.json()).toMatchObject({ autorise: false });
    expect(lignes.some((l) => l.contexte?.['alerte'] === 'acces-refuse')).toBe(true);

    // La patiente consent au partage avec CE médecin.
    const cree = await a.inject({
      method: 'POST',
      url: '/patients/fictif-patient-0001/consentements',
      headers: patient,
      payload: {
        categorie: 'C-PARTAGE-PRO',
        mode: 'vocal',
        versionTexte: 'C-PARTAGE-PRO v0.1 (fr)',
        accepte: true,
        beneficiaire: 'Practitioner/fictif-medecin-0001',
      },
    });
    expect(cree.statusCode).toBe(201);
    const id = cree.json<{ id: string }>().id;

    const pendant = await a.inject({
      method: 'POST',
      url: '/acces/dossier',
      headers: medecin,
      payload: { patientId: 'fictif-patient-0001' },
    });
    expect(pendant.json()).toMatchObject({ autorise: true, motif: 'consentement-partage-pro' });

    // Révocation par la patiente : effet immédiat.
    const rev = await a.inject({
      method: 'POST',
      url: `/consentements/${id}/revocation`,
      headers: patient,
    });
    expect(rev.statusCode).toBe(200);
    const apres = await a.inject({
      method: 'POST',
      url: '/acces/dossier',
      headers: medecin,
      payload: { patientId: 'fictif-patient-0001' },
    });
    expect(apres.json()).toMatchObject({ autorise: false });
  });

  it('retrait des proches par l’équipe : refusé à un médecin (403) et sans jeton (401)', async () => {
    const a = await app();
    const url = '/patients/fictif-patient-0001/proches/retrait-assistance';
    const medecin = { authorization: `Bearer ${await jetonMedecin()}` };
    expect((await a.inject({ method: 'POST', url, headers: medecin })).statusCode).toBe(403);
    expect((await a.inject({ method: 'POST', url })).statusCode).toBe(401);
  });

  it('le médecin ne peut ni lire ni créer les consentements de la patiente (403)', async () => {
    const a = await app();
    const medecin = { authorization: `Bearer ${await jetonMedecin()}` };
    expect(
      (
        await a.inject({
          method: 'GET',
          url: '/patients/fictif-patient-0001/consentements',
          headers: medecin,
        })
      ).statusCode,
    ).toBe(403);
    const r = await a.inject({
      method: 'POST',
      url: '/patients/fictif-patient-0001/consentements',
      headers: medecin,
      payload: { categorie: 'C-SOINS', mode: 'texte', versionTexte: 'x', accepte: true },
    });
    expect(r.statusCode).toBe(403);
  });

  it('refuse une catégorie inventée (400) et un partage sans bénéficiaire (422)', async () => {
    const a = await app();
    const patient = { authorization: `Bearer ${await jetonPatient()}` };
    const inconnue = await a.inject({
      method: 'POST',
      url: '/patients/fictif-patient-0001/consentements',
      headers: patient,
      payload: { categorie: 'TOUT-ACCEPTER', mode: 'texte', versionTexte: 'x', accepte: true },
    });
    expect(inconnue.statusCode).toBe(400);
    const sansBeneficiaire = await a.inject({
      method: 'POST',
      url: '/patients/fictif-patient-0001/consentements',
      headers: patient,
      payload: { categorie: 'C-PROCHE', mode: 'texte', versionTexte: 'x', accepte: true },
    });
    expect(sansBeneficiaire.statusCode).toBe(422);
  });

  it('bris de glace : accordé, journalisé en avertissement pour revue humaine', async () => {
    lignes.length = 0;
    const r = await (
      await app()
    ).inject({
      method: 'POST',
      url: '/acces/dossier',
      headers: { authorization: `Bearer ${await jetonMedecin()}` },
      payload: {
        patientId: 'fictif-patient-0001',
        brisDeGlace: { motif: 'Patient inconscient au point assisté [FICTIF]' },
      },
    });
    expect(r.json()).toMatchObject({ autorise: true, audit: 'alerte' });
    expect(
      lignes.some((l) => l.niveau === 'avertissement' && l.message.includes('BRIS DE GLACE')),
    ).toBe(true);
    // Événement d'alerte nommé, compté par la supervision (ADR-0016).
    expect(lignes.some((l) => l.contexte?.['alerte'] === 'bris-de-glace')).toBe(true);
  });

  it('le journal ne contient jamais le texte de consentement ni de jeton', async () => {
    lignes.length = 0;
    const jeton = await jetonPatient();
    await (
      await app()
    ).inject({
      method: 'POST',
      url: '/patients/fictif-patient-0001/consentements',
      headers: { authorization: `Bearer ${jeton}` },
      payload: {
        categorie: 'C-SOINS',
        mode: 'vocal',
        versionTexte: 'Texte C-SOINS v0.1 [FICTIF]',
        accepte: true,
      },
    });
    const tout = JSON.stringify(lignes);
    expect(tout).not.toContain(jeton);
    expect(tout).not.toContain('Texte C-SOINS');
  });

  it('dossier médical : refus du serveur en 422, indisponibilité en 503 journalisée', async () => {
    class DepotEnPanne extends DepotMemoire {
      override async ajouter(): Promise<never> {
        throw new ErreurDepot('Consentement refusé par le dossier médical.', 422);
      }
      override async parPatient(): Promise<never> {
        throw new ErreurDepot('Dossier médical indisponible.', 503);
      }
    }
    const depot = new DepotEnPanne();
    const serveur = await creerServeur({
      verifierJeton: creerVerificateur({
        emetteur: EMETTEUR,
        audience: AUDIENCE,
        cles: createLocalJWKSet(jwks),
      }),
      consentements: new ServiceConsentements(depot, 'dev', { estActif: async () => true }),
      depot,
      journalAcces: new JournalAccesMemoire(),
      revue: new ServiceRevue(new JournalAccesMemoire(), 'dev', 24),
      env: 'dev',
      journal,
    });
    const entetes = { authorization: `Bearer ${await jetonPatient()}` };
    lignes.length = 0;
    const cree = await serveur.inject({
      method: 'POST',
      url: '/patients/fictif-patient-0001/consentements',
      headers: entetes,
      payload: { categorie: 'C-SOINS', mode: 'texte', versionTexte: 'v0 [FICTIF]', accepte: true },
    });
    expect(cree.statusCode).toBe(422);
    const acces = await serveur.inject({
      method: 'POST',
      url: '/acces/dossier',
      headers: entetes,
      payload: { patientId: 'fictif-patient-0001' },
    });
    // Sans dossier consultable, pas de décision d'accès : on refuse de répondre plutôt que d'accorder.
    expect(acces.statusCode).toBe(503);
    expect(lignes.some((l) => l.niveau === 'erreur')).toBe(true);
  });

  it('trace chaque décision dans le dossier ; le patient voit l’historique, le médecin non', async () => {
    const journalAcces = new JournalAccesMemoire();
    const a = await app(journalAcces);
    const medecin = { authorization: `Bearer ${await jetonMedecin()}` };
    const patient = { authorization: `Bearer ${await jetonPatient()}` };
    const refus = await a.inject({
      method: 'POST',
      url: '/acces/dossier',
      headers: medecin,
      payload: { patientId: 'fictif-patient-0001' },
    });
    expect(refus.json()).toMatchObject({ autorise: false });
    const urgence = await a.inject({
      method: 'POST',
      url: '/acces/dossier',
      headers: medecin,
      payload: {
        patientId: 'fictif-patient-0001',
        brisDeGlace: { motif: 'Patient inconscient aux urgences [FICTIF]' },
      },
    });
    expect(urgence.json()).toMatchObject({ autorise: true, motif: 'bris-de-glace' });
    expect(journalAcces.traces.map((t) => t.outcome)).toEqual(['4', '0']);

    const historique = await a.inject({
      method: 'GET',
      url: '/patients/fictif-patient-0001/acces',
      headers: patient,
    });
    expect(historique.statusCode).toBe(200);
    const { acces } = historique.json<{ acces: Record<string, unknown>[] }>();
    expect(acces).toHaveLength(2);
    expect(acces.find((x) => x['urgence'])).toMatchObject({
      autorise: true,
      motif: 'bris-de-glace',
      roles: ['professionnel'],
      justification: 'Patient inconscient aux urgences [FICTIF]',
    });
    const parMedecin = await a.inject({
      method: 'GET',
      url: '/patients/fictif-patient-0001/acces',
      headers: medecin,
    });
    expect(parMedecin.statusCode).toBe(403);
  });

  it('aucun accès accordé sans trace : 503 si le journal est indisponible ; un refus reste un refus', async () => {
    const enPanne: JournalAcces = {
      consigner: async () => {
        throw new ErreurDepot('Dossier médical indisponible.', 503);
      },
      parPatient: async () => [],
      parSousType: async () => [],
    };
    const a = await app(enPanne);
    const accordable = await a.inject({
      method: 'POST',
      url: '/acces/dossier',
      headers: { authorization: `Bearer ${await jetonPatient()}` },
      payload: { patientId: 'fictif-patient-0001' },
    });
    expect(accordable.statusCode).toBe(503);
    const refus = await a.inject({
      method: 'POST',
      url: '/acces/dossier',
      headers: { authorization: `Bearer ${await jetonMedecin()}` },
      payload: { patientId: 'fictif-patient-0001' },
    });
    expect(refus.statusCode).toBe(200);
    expect(refus.json()).toMatchObject({ autorise: false });
  });
});

describe('limites d’appels', () => {
  it('au-delà de la limite par minute, répond 429 avec un message simple', async () => {
    const a = await app(new JournalAccesMemoire(), 2);
    expect((await a.inject({ method: 'GET', url: '/sante' })).statusCode).toBe(200);
    expect((await a.inject({ method: 'GET', url: '/sante' })).statusCode).toBe(200);
    const r = await a.inject({ method: 'GET', url: '/sante' });
    expect(r.statusCode).toBe(429);
    expect(r.json()).toEqual({ erreur: 'Trop de requêtes. Réessayez dans une minute.' });
    expect(lignes.some((l) => l.contexte?.['alerte'] === 'limite-appels')).toBe(true);
  });
});
