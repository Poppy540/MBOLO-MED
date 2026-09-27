import { describe, expect, it } from 'vitest';
import { ErreurJetonService, creerFournisseurJeton } from './jeton-service.js';

// Faux serveur Keycloak ; secret de test construit à l'exécution (aucun secret dans le dépôt).
const SECRET = ['secret', 'de', 'test'].join('-');

function fauxKeycloak(reponses: Response[]) {
  const corps: string[] = [];
  const f = (async (_url: string | URL | Request, init?: RequestInit) => {
    corps.push(String(init?.body));
    const r = reponses.shift();
    if (!r) throw new TypeError('fetch failed');
    return r;
  }) as typeof fetch;
  return { corps, f };
}

const jeton = (valeur: string, expiresIn = 300) =>
  new Response(JSON.stringify({ access_token: valeur, expires_in: expiresIn }), { status: 200 });

describe('jeton de service', () => {
  it('demande un jeton client_credentials et le réutilise tant qu’il est valide', async () => {
    let t = 0;
    const { corps, f } = fauxKeycloak([jeton('j1'), jeton('j2')]);
    const fournir = creerFournisseurJeton({
      emetteur: 'https://kc.test/realms/mbolo',
      client: 'mbolo-identite-service',
      secret: SECRET,
      fetch: f,
      maintenant: () => t,
    });
    expect(await fournir()).toEqual({ authorization: 'Bearer j1' });
    t = 200_000;
    expect(await fournir()).toEqual({ authorization: 'Bearer j1' });
    // 30 s avant l'expiration (300 s), le jeton est renouvelé.
    t = 271_000;
    expect(await fournir()).toEqual({ authorization: 'Bearer j2' });
    expect(corps).toHaveLength(2);
    expect(corps[0]).toContain('grant_type=client_credentials');
    expect(corps[0]).toContain('client_id=mbolo-identite-service');
  });

  it('partage une seule demande entre des appels simultanés', async () => {
    const { corps, f } = fauxKeycloak([jeton('j1')]);
    const fournir = creerFournisseurJeton({
      emetteur: 'https://kc.test',
      client: 'c',
      secret: SECRET,
      fetch: f,
    });
    await Promise.all([fournir(), fournir(), fournir()]);
    expect(corps).toHaveLength(1);
  });

  it('échoue proprement si Keycloak refuse ou ne répond pas, sans exposer le secret', async () => {
    const { f } = fauxKeycloak([new Response('{"error":"unauthorized_client"}', { status: 401 })]);
    const fournir = creerFournisseurJeton({
      emetteur: 'https://kc.test',
      client: 'c',
      secret: SECRET,
      fetch: f,
    });
    const erreur = await fournir().catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurJetonService);
    expect(String((erreur as Error).message)).not.toContain(SECRET);
    await expect(fournir()).rejects.toBeInstanceOf(ErreurJetonService);
  });
});
