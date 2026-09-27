import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  EXTENSION_STATUT_IDENTITE,
  SYSTEMES,
  consentement,
  patientInscrit,
} from '@mbolo/dossier-fhir';
import type { Journal } from '@mbolo/journal-securise';
import { creerVerificateur } from './jeton.js';
import { creerPasserelle, sansBarreFinale } from './passerelle.js';

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

/** [FICTIF] Patient à vérifier, version 3 dans le dossier. */
const patientVerifiable = () => ({
  ...patientInscrit({
    nom: 'Fictif',
    prenom: 'Patiente',
    naissance: '1990-01-01',
    telephone: '+241 00 00 00 00',
    env: 'dev',
  }),
  id: 'pat-fictif-001',
  meta: {
    ...patientInscrit({ nom: 'x', prenom: 'y', naissance: '1990-01-01', env: 'dev' }).meta,
    versionId: '3',
  },
});

interface Appel {
  url: string;
  methode: string;
  entetes: Record<string, string>;
}

async function passerelle(
  reponse: () => Response = () => new Response('{}', { status: 200 }),
  limiteParMinute?: number,
) {
  const appels: Appel[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    appels.push({
      url: String(url),
      methode: init?.method ?? 'GET',
      entetes: (init?.headers ?? {}) as Record<string, string>,
    });
    return reponse();
  }) as typeof fetch;
  const app = await creerPasserelle({
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
    ...(limiteParMinute ? { limiteParMinute } : {}),
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
    const { app, appels } = await passerelle();
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
    const { app, appels } = await passerelle();
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
    const { app, appels } = await passerelle();
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
    const { app, appels } = await passerelle(
      () => new Response(JSON.stringify(bundle), { status: 200 }),
    );
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

  it('minimisation : un client restreint ne reçoit que les éléments autorisés, quoi qu’il demande', async () => {
    const patient = {
      resourceType: 'Patient',
      id: 'pat-fictif-001',
      name: [{ text: '[FICTIF] Patiente Test' }],
      birthDate: '1990-01-01',
      telecom: [{ system: 'phone', value: '+241 00 00 00 00' }],
    };
    const jeton = await signer({
      azp: 'mbolo-notifications-service',
      mbolo_scopes: 'system/Patient.rs',
      mbolo_elements: 'Patient.telecom',
    });
    const lecture = await passerelle(() => new Response(JSON.stringify(patient), { status: 200 }));
    const r = await lecture.app.inject({
      method: 'GET',
      url: '/fhir/Patient/pat-fictif-001?_elements=name',
      headers: await auth(jeton),
    });
    expect(r.statusCode).toBe(200);
    expect(lecture.appels[0]?.url).toBe(`${AMONT}/Patient/pat-fictif-001?_elements=telecom`);
    expect(r.json()).toEqual({
      resourceType: 'Patient',
      id: 'pat-fictif-001',
      telecom: patient.telecom,
    });

    const bundle = { resourceType: 'Bundle', type: 'searchset', entry: [{ resource: patient }] };
    const recherche = await passerelle(() => new Response(JSON.stringify(bundle), { status: 200 }));
    const s = await recherche.app.inject({
      method: 'GET',
      url: '/fhir/Patient?_id=pat-fictif-001&_elements=name,birthDate',
      headers: await auth(jeton),
    });
    expect(recherche.appels[0]?.url).toBe(`${AMONT}/Patient?_id=pat-fictif-001&_elements=telecom`);
    expect(s.body).not.toContain('Patiente Test');
    expect(s.body).not.toContain('1990-01-01');
    expect(s.body).toContain('+241 00 00 00 00');
  });

  it('modification restreinte : seuls les éléments modifiables changent, le reste est conservé', async () => {
    const actuel = patientVerifiable();
    const envois: {
      methode: string;
      corps?: Record<string, unknown>;
      entetes: Record<string, string>;
    }[] = [];
    const f = (async (_url: string | URL | Request, init?: RequestInit) => {
      envois.push({
        methode: init?.method ?? 'GET',
        entetes: (init?.headers ?? {}) as Record<string, string>,
        ...(init?.body ? { corps: JSON.parse(String(init.body)) as Record<string, unknown> } : {}),
      });
      return new Response(JSON.stringify(init?.body ? JSON.parse(String(init.body)) : actuel), {
        status: 200,
      });
    }) as typeof fetch;
    const app = await creerPasserelle({
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
    const jeton = await signer({
      azp: 'mbolo-documents-service',
      mbolo_scopes: 'system/Patient.ru',
      mbolo_elements: 'Patient.extension Patient.identifier Patient.name Patient.birthDate',
      mbolo_elements_modifiables: 'Patient.extension Patient.identifier',
    });
    const statut = [{ url: EXTENSION_STATUT_IDENTITE, valueCode: 'verifiee' }];
    const numero = [
      {
        system: 'https://mbolo-sante.example/fhir/identifiant/ga/provisoire',
        type: { coding: [{ system: SYSTEMES.typeIdentifiantPatient, code: 'provisoire' }] },
        value: 'FICTIF-PROV-0001',
      },
    ];
    const r = await app.inject({
      method: 'PUT',
      url: '/fhir/Patient/pat-fictif-001',
      headers: { ...(await auth(jeton)), 'content-type': 'application/fhir+json' },
      payload: {
        resourceType: 'Patient',
        id: 'pat-fictif-001',
        extension: statut,
        identifier: numero,
      },
    });
    expect(r.statusCode).toBe(200);
    const ecriture = envois.find((e) => e.methode === 'PUT');
    // Nom, naissance et téléphone conservés ; statut et numéro remplacés ; verrou sur la version lue.
    expect(ecriture?.corps).toMatchObject({
      name: actuel.name,
      birthDate: actuel.birthDate,
      telecom: actuel.telecom,
      extension: statut,
      identifier: numero,
    });
    expect(ecriture?.entetes['if-match']).toBe('W/"3"');
    // Le téléphone ne sort pas de la passerelle (non lisible par ce client).
    expect(r.body).not.toContain('+241 00 00 00 00');

    const nom = await app.inject({
      method: 'PUT',
      url: '/fhir/Patient/pat-fictif-001',
      headers: { ...(await auth(jeton)), 'content-type': 'application/fhir+json' },
      payload: { resourceType: 'Patient', id: 'pat-fictif-001', name: [{ family: 'Autre' }] },
    });
    expect(nom.statusCode).toBe(403);
    // Un client restreint sans éléments modifiables ne modifie rien.
    const lecteur = await signer({
      azp: 'mbolo-teleconsultation-service',
      mbolo_scopes: 'system/Patient.ru',
      mbolo_elements: 'Patient.extension',
    });
    const refus = await app.inject({
      method: 'PUT',
      url: '/fhir/Patient/pat-fictif-001',
      headers: { ...(await auth(lecteur)), 'content-type': 'application/fhir+json' },
      payload: { resourceType: 'Patient', id: 'pat-fictif-001', extension: statut },
    });
    expect(refus.statusCode).toBe(403);
    expect(envois.filter((e) => e.methode === 'PUT')).toHaveLength(1);
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
    const { app } = await passerelle(() => new Response(JSON.stringify(bundle), { status: 200 }));
    const r = await app.inject({
      method: 'GET',
      url: '/fhir/Consent?patient=Patient/x',
      headers: await auth(),
    });
    expect(r.statusCode).toBe(403);
  });

  it('valide les écritures avec les règles Mbolo avant de les transmettre', async () => {
    const { app, appels } = await passerelle(
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
    const { app } = await passerelle(() => {
      throw new TypeError('fetch failed');
    });
    const r = await app.inject({ method: 'GET', url: '/fhir/Consent/1', headers: await auth() });
    expect(r.statusCode).toBe(502);
    expect(r.body).not.toContain('hapi.interne');
  });

  it('journalise les accès sans contenu médical ni jeton', async () => {
    lignes.length = 0;
    const jeton = await jetonIdentite();
    const { app } = await passerelle(
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

  it('une trace (AuditEvent, Provenance) ne peut jamais être modifiée, même avec la permission', async () => {
    const { app, appels } = await passerelle();
    const jeton = await signer({
      azp: 'client-de-test',
      mbolo_scopes: 'system/AuditEvent.cruds system/Provenance.cruds',
    });
    const h = { authorization: `Bearer ${jeton}`, 'content-type': 'application/fhir+json' };
    for (const type of ['AuditEvent', 'Provenance']) {
      const r = await app.inject({
        method: 'PUT',
        url: `/fhir/${type}/1`,
        headers: h,
        payload: { resourceType: type, id: '1' },
      });
      expect(r.statusCode, type).toBe(403);
    }
    expect(appels).toHaveLength(0);
  });
});

describe('limite d’appels de la passerelle', () => {
  it('au-delà de la limite par minute, répond 429 en OperationOutcome', async () => {
    const { app } = await passerelle(undefined, 2);
    await app.inject({ method: 'GET', url: '/sante' });
    await app.inject({ method: 'GET', url: '/sante' });
    const r = await app.inject({ method: 'GET', url: '/sante' });
    expect(r.statusCode).toBe(429);
    expect(r.json()).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [{ diagnostics: 'Trop de requêtes. Réessayez dans une minute.' }],
    });
  });
});

describe('sansBarreFinale', () => {
  it('retire les « / » finaux, même très nombreux, en temps linéaire', () => {
    expect(sansBarreFinale(`${AMONT}///`)).toBe(AMONT);
    expect(sansBarreFinale(AMONT)).toBe(AMONT);
    expect(sansBarreFinale(`http://a${'/'.repeat(100_000)}`)).toBe('http://a');
  });
});
