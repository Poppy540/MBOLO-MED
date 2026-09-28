// Durcissement HTTP commun (revue ASVS n°1). Données FICTIVES uniquement.
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { ErreurAdresseNonChiffree, entetesSecurite, exigerHttps } from './securite-http.js';

describe('entetesSecurite (C1)', () => {
  it('pose nosniff et no-store par défaut, sans écraser un choix de la route', async () => {
    const app = Fastify();
    entetesSecurite(app);
    app.get('/donnees', async () => ({ fictif: true }));
    app.get('/choisi', async (_req, reply) =>
      reply.header('cache-control', 'private, max-age=60').send({}),
    );
    const r = await app.inject({ method: 'GET', url: '/donnees' });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['cache-control']).toBe('no-store');
    // Une erreur aussi : même en-têtes.
    const inconnue = await app.inject({ method: 'GET', url: '/absente' });
    expect(inconnue.headers['cache-control']).toBe('no-store');
    const choisi = await app.inject({ method: 'GET', url: '/choisi' });
    expect(choisi.headers['cache-control']).toBe('private, max-age=60');
    expect(choisi.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('exigerHttps (C2)', () => {
  it('en production, refuse http, ws et une adresse illisible, en nommant seulement les variables', () => {
    const e = (() => {
      try {
        exigerHttps(
          {
            FHIR_BASE_URL: 'http://dossier.example/fhir',
            KEYCLOAK_ISSUER: 'https://auth.example/realms/mbolo',
            WEBRTC_SERVER_URL: 'ws://visio.example',
            IDENTITE_URL: 'pas une adresse',
            ABSENTE: undefined,
          },
          true,
        );
      } catch (x) {
        return x;
      }
      return undefined;
    })();
    expect(e).toBeInstanceOf(ErreurAdresseNonChiffree);
    expect((e as Error).message).toBe(
      'Adresses non chiffrées refusées en production : FHIR_BASE_URL, WEBRTC_SERVER_URL, IDENTITE_URL.',
    );
    expect((e as Error).message).not.toContain('dossier.example');
  });

  it('accepte https et wss en production ; hors production, ne vérifie rien', () => {
    expect(() =>
      exigerHttps({ A: 'https://a.example', B: 'wss://b.example', C: '' }, true),
    ).not.toThrow();
    expect(() => exigerHttps({ A: 'http://127.0.0.1:3001' }, false)).not.toThrow();
  });
});
