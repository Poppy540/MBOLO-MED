import { describe, expect, it } from 'vitest';
import { DecideurIdentite, ErreurDecision } from './acces.js';

describe('DecideurIdentite', () => {
  it('présente le jeton du demandeur à identite et relaie la décision', async () => {
    const appels: { url: string; init: RequestInit }[] = [];
    const d = new DecideurIdentite('http://identite.fictif.example', (async (
      url: string,
      init: RequestInit,
    ) => {
      appels.push({ url, init });
      return new Response(JSON.stringify({ autorise: true, motif: 'consentement-partage-pro' }));
    }) as typeof fetch);
    expect(await d.decider('jeton-fictif', 'pat-fictif-001')).toEqual({
      autorise: true,
      motif: 'consentement-partage-pro',
    });
    expect(appels[0]?.url).toBe('http://identite.fictif.example/acces/dossier');
    expect((appels[0]?.init.headers as Record<string, string>)['authorization']).toBe(
      'Bearer jeton-fictif',
    );
  });

  it('sans réponse claire d’identite, jamais d’accès (erreur, pas d’autorisation)', async () => {
    const enPanne = new DecideurIdentite(
      'http://x',
      (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch,
    );
    await expect(enPanne.decider('j', 'p')).rejects.toBeInstanceOf(ErreurDecision);
    const ambigu = new DecideurIdentite(
      'http://x',
      (async () => new Response(JSON.stringify({ autorise: 'oui' }))) as unknown as typeof fetch,
    );
    expect((await ambigu.decider('j', 'p')).autorise).toBe(false);
  });
});
