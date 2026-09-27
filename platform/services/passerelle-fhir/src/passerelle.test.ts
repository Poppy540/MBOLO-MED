import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { consentement } from '@mbolo/dossier-fhir';
import type { Journal } from '@mbolo/journal-securise';
import { creerVerificateur } from './jeton.js';
import { creerPasserelle } from './passerelle.js';

// Clés générées pour le test ; données FICTIVES ; faux serveur FHIR.
const EMETTEUR = 'https://auth.mbolo-sante.example/realms/mbolo';
const AMONT = 'http://hapi.interne:8080/fhir';
const PUBLIQUE = 'http://passerelle.test/fhir';
let signer: (revendications: Record<string, unknown>, audience?: string) => Promise<string>;
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
  signer = (revendications, audience = 'mbolo-dossier-fhir') =>
    new SignJWT(revendications)
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(EMETTEUR)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
});

interface Appel {
  url: string;
  methode: string;
  entetes: Record<string, string>;
}

function passerelle(reponse: () => Response = () => new Response('{}', { status: 200 })) {
  const appels: Appel[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    appels.push({
      url: String(url),
      methode: init?.method ?? 'GET',
      entetes: (init?.headers ?? {}) as Record<string, string>,
    });
    return reponse();
  }) as typeof fetch;
  const app = creerPasserelle({
    verifierJeton: creerVerificateur({
      emetteur: EMETTEUR,
      audience: 'mbolo-dossier-fhir',
      cles: createLocalJWKSet(jwks),
    }),
    amont: AMONT,
    publique: PUBLIQUE,
    env: 'dev',
    journal,
    fetch: f,
  });
  return { app, appels };
}

const jetonIdentite = () =>
  signer({ azp: 'mbolo-identite-service', mbolo_scopes: 'system/Consent.crus' });
const auth = async (jeton?: string) => ({
  authorization: `Bearer ${jeton ?? (await jetonIdentite())}`,
});
const consentFictif = () =>
  consentement({
    patientId: 'pat-fictif-001',
    categorie: 'C-SOINS',
    mode: 'texte',
    date: '2026-09-27T08:00:00Z',
    versionTexte: 'v0 [FICTIF]',
    accepte: true,
    env: 'dev',
  });

describe('passerelle du dossier', () => {
  it('401 sans jeton, avec un jeton d’une autre audience (jeton d’utilisateur) ou altéré', async () => {
    const { app, appels } = passerelle();
    expect((await app.inject({ method: 'GET', url: '/fhir/Consent/1' })).statusCode).toBe(401);
    const autre = await signer({ azp: 'mbolo-app-patient' }, 'mbolo-identite-api');
    const r1 = await app.inject({
      method: 'GET',
      url: '/fhir/Consent/1',
      headers: await auth(autre),
    });
    expect(r1.statusCode).toBe(401);
    const [e, c, s] = (await jetonIdentite()).split('.');
    const faux = `${e}.${Buffer.from(JSON.stringify({ azp: 'x', mbolo_scopes: 'system/Patient.r' })).toString('base64url')}.${s}`;
    expect(c).toBeDefined();
    const r2 = await app.inject({
      method: 'GET',
      url: '/fhir/Patient/1',
      headers: await auth(faux),
    });
    expect(r2.statusCode).toBe(401);
    expect(appels).toHaveLength(0);
  });

  it('403 hors des permissions : autre type, suppression, et le serveur interne n’est pas appelé', async () => {
    const { app, appels } = passerelle();
    const h = await auth();
    expect(
      (await app.inject({ method: 'GET', url: '/fhir/Patient/pat-fictif-001', headers: h }))
        .statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'GET', url: '/fhir/Condition?patient=Patient/x', headers: h }))
        .statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'DELETE', url: '/fhir/Consent/1', headers: h })).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/fhir',
          headers: h,
          payload: { resourceType: 'Bundle' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: '/fhir/Consent/1/_history', headers: h })).statusCode,
    ).toBe(404);
    expect(appels).toHaveLength(0);
    expect(lignes.some((l) => l.message === 'accès au dossier refusé')).toBe(true);
  });

  it('refuse les paramètres qui ramèneraient d’autres ressources (_include, _revinclude, chaînage)', async () => {
    const { app, appels } = passerelle();
    const h = await auth();
    for (const q of [
      '_include=Consent:patient',
      '_revinclude=Provenance:target',
      'patient.name=x',
      '_has:Condition:subject:code=x',
    ]) {
      const r = await app.inject({ method: 'GET', url: `/fhir/Consent?${q}`, headers: h });
      expect(r.statusCode, q).toBe(403);
    }
    expect(appels).toHaveLength(0);
  });

  it('relaie une recherche autorisée et réécrit les liens vers l’adresse publique', async () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      link: [{ relation: 'next', url: `${AMONT}?_getpages=abc&_getpagesoffset=100` }],
      entry: [{ resource: { resourceType: 'Consent', id: '1' } }],
    };
    const { app, appels } = passerelle(() => new Response(JSON.stringify(bundle), { status: 200 }));
    const r = await app.inject({
      method: 'GET',
      url: '/fhir/Consent?patient=Patient%2Fpat-fictif-001&_count=100',
      headers: { ...(await auth()), 'cache-control': 'no-cache' },
    });
    expect(r.statusCode).toBe(200);
    expect(appels[0]?.url).toBe(`${AMONT}/Consent?patient=Patient%2Fpat-fictif-001&_count=100`);
    expect(appels[0]?.entetes['cache-control']).toBe('no-cache');
    expect(appels[0]?.entetes['authorization']).toBeUndefined();
    expect(r.body).toContain(`${PUBLIQUE}?_getpages=abc`);
    expect(r.body).not.toContain(AMONT);
  });

  it('bloque une réponse qui contient des ressources hors du périmètre du client', async () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        { resource: { resourceType: 'Consent', id: '1' } },
        { resource: { resourceType: 'Patient', id: 'p' } },
      ],
    };
    const { app } = passerelle(() => new Response(JSON.stringify(bundle), { status: 200 }));
    const r = await app.inject({
      method: 'GET',
      url: '/fhir/Consent?patient=Patient/x',
      headers: await auth(),
    });
    expect(r.statusCode).toBe(403);
  });

  it('valide les écritures avec les règles Mbolo avant de les transmettre', async () => {
    const { app, appels } = passerelle(
      () =>
        new Response(JSON.stringify({ resourceType: 'Consent', id: '7' }), {
          status: 201,
          headers: { location: `${AMONT}/Consent/7/_history/1` },
        }),
    );
    const h = { ...(await auth()), 'content-type': 'application/fhir+json' };
    const ok = await app.inject({
      method: 'POST',
      url: '/fhir/Consent',
      headers: h,
      payload: consentFictif(),
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.headers['location']).toBe(`${PUBLIQUE}/Consent/7/_history/1`);
    // Sans marqueur fictif hors production : refusé par les règles, jamais transmis.
    const sansMarqueur = { ...consentFictif(), meta: {} };
    const ko = await app.inject({
      method: 'POST',
      url: '/fhir/Consent',
      headers: h,
      payload: sansMarqueur,
    });
    expect(ko.statusCode).toBe(422);
    // Type ou identifiant qui ne correspondent pas à l'adresse : refusé.
    const mauvais = await app.inject({
      method: 'PUT',
      url: '/fhir/Consent/8',
      headers: h,
      payload: { ...consentFictif(), id: '9' },
    });
    expect(mauvais.statusCode).toBe(400);
    expect(appels).toHaveLength(1);
  });

  it('502 si le serveur FHIR est injoignable, sans détail interne', async () => {
    const { app } = passerelle(() => {
      throw new TypeError('fetch failed');
    });
    const r = await app.inject({ method: 'GET', url: '/fhir/Consent/1', headers: await auth() });
    expect(r.statusCode).toBe(502);
    expect(r.body).not.toContain('hapi.interne');
  });

  it('journalise les accès sans contenu médical ni jeton', async () => {
    lignes.length = 0;
    const jeton = await jetonIdentite();
    const { app } = passerelle(
      () => new Response(JSON.stringify({ resourceType: 'Consent', id: '7' }), { status: 201 }),
    );
    await app.inject({
      method: 'POST',
      url: '/fhir/Consent',
      headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/fhir+json' },
      payload: consentFictif(),
    });
    const tout = JSON.stringify(lignes);
    expect(tout).toContain('mbolo-identite-service');
    expect(tout).not.toContain(jeton);
    expect(tout).not.toContain('v0 [FICTIF]');
  });
});
