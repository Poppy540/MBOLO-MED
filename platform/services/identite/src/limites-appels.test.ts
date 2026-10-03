import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { cleLimite, limiterAppels } from './limites-appels.js';

// Jetons FICTIFS : seule leur valeur distincte compte ici, ils ne sont pas vérifiés.
const jeton = (n: number) => `fictif.jeton-${n}.signature`;

async function serveur(o: { parMinute: number; plafondParAdresse?: number }) {
  const app = Fastify();
  await limiterAppels(app, o);
  // Comme dans les services : une limite dépassée devient une réponse 429.
  app.setErrorHandler((err, _req, reply) =>
    reply.code((err as { statusCode?: number }).statusCode ?? 500).send({ erreur: 'refus' }),
  );
  app.get('/ouvert', async () => ({ ok: true }));
  // Route sensible : sa propre limite, comptée par session elle aussi (ex. collecte du paiement).
  app.post(
    '/sensible',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async () => ({
      ok: true,
    }),
  );
  return app;
}

const appel = (
  app: Awaited<ReturnType<typeof serveur>>,
  url: string,
  n?: number,
  adresse = '10.0.0.1',
) =>
  app.inject({
    method: url === '/sensible' ? 'POST' : 'GET',
    url,
    remoteAddress: adresse,
    ...(n === undefined ? {} : { headers: { authorization: `Bearer ${jeton(n)}` } }),
  });

describe('limites d’appels (ASVS n°3, C9)', () => {
  it('derrière une même adresse (NAT d’opérateur), 10 patients paient sans se bloquer', async () => {
    const app = await serveur({ parMinute: 300 });
    for (let patient = 0; patient < 10; patient += 1) {
      for (let i = 0; i < 5; i += 1) {
        expect((await appel(app, '/sensible', patient)).statusCode).toBe(200);
      }
    }
    // La limite de la route vaut toujours pour chaque session : le 6ᵉ essai d'un patient est refusé.
    expect((await appel(app, '/sensible', 3)).statusCode).toBe(429);
    expect((await appel(app, '/sensible', 10)).statusCode).toBe(200);
  });

  it('la limite générale est comptée par session, et par adresse sans jeton', async () => {
    const app = await serveur({ parMinute: 3 });
    for (let i = 0; i < 3; i += 1) expect((await appel(app, '/ouvert', 1)).statusCode).toBe(200);
    expect((await appel(app, '/ouvert', 1)).statusCode).toBe(429);
    expect((await appel(app, '/ouvert', 2)).statusCode).toBe(200);
    for (let i = 0; i < 3; i += 1) expect((await appel(app, '/ouvert')).statusCode).toBe(200);
    expect((await appel(app, '/ouvert')).statusCode).toBe(429);
    expect((await appel(app, '/ouvert', undefined, '10.0.0.2')).statusCode).toBe(200);
  });

  it('un plafond par adresse arrête une rafale qui change de jeton à chaque appel', async () => {
    const app = await serveur({ parMinute: 3, plafondParAdresse: 10 });
    for (let i = 0; i < 10; i += 1)
      expect((await appel(app, '/ouvert', 100 + i)).statusCode).toBe(200);
    const refus = await appel(app, '/ouvert', 999);
    expect(refus.statusCode).toBe(429);
    expect(refus.headers['retry-after']).toBeDefined();
    // Une autre adresse n'est pas touchée.
    expect((await appel(app, '/ouvert', 999, '10.0.0.2')).statusCode).toBe(200);
  });

  it('la clé ne contient jamais le jeton lui-même', () => {
    const req = { headers: { authorization: `Bearer ${jeton(1)}` }, ip: '10.0.0.1' };
    const cle = cleLimite(req as never);
    expect(cle).toMatch(/^jeton:[0-9a-f]{32}$/);
    expect(cle).not.toContain('fictif');
    expect(cleLimite({ headers: {}, ip: '10.0.0.1' } as never)).toBe('adresse:10.0.0.1');
  });
});
