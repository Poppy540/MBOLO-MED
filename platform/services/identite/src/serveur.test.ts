import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { DepotMemoire, ServiceConsentements } from './consentements.js';
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

const app = () => {
  const depot = new DepotMemoire();
  return creerServeur({
    verifierJeton: creerVerificateur({
      emetteur: EMETTEUR,
      audience: AUDIENCE,
      cles: createLocalJWKSet(jwks),
    }),
    consentements: new ServiceConsentements(depot, 'dev'),
    depot,
    journal,
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
    const r = await app().inject({ method: 'GET', url: '/sante' });
    expect(r.statusCode).toBe(200);
  });

  it('401 sans jeton, avec un jeton d’un autre émetteur, ou un jeton altéré', async () => {
    const a = app();
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
    const a = app();
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

  it('le médecin ne peut ni lire ni créer les consentements de la patiente (403)', async () => {
    const a = app();
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
    const a = app();
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
    const r = await app().inject({
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
  });

  it('le journal ne contient jamais le texte de consentement ni de jeton', async () => {
    lignes.length = 0;
    const jeton = await jetonPatient();
    await app().inject({
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
});
