import { exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  ErreurJetonService,
  authentificationDepuis,
  creerFournisseurJeton,
  lirePem,
} from './jeton-service.js';

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
      authentification: { secret: SECRET },
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
      authentification: { secret: SECRET },
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
      authentification: { secret: SECRET },
      fetch: f,
    });
    const erreur = await fournir().catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurJetonService);
    expect(String((erreur as Error).message)).not.toContain(SECRET);
    await expect(fournir()).rejects.toBeInstanceOf(ErreurJetonService);
  });
});

describe('jeton de service par clé privée (private_key_jwt, ADR-0016)', () => {
  it('signe une assertion courte et à usage unique, sans jamais envoyer de secret', async () => {
    // Paire de clés générée pour le test (jamais écrite sur disque).
    const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const { corps, f } = fauxKeycloak([jeton('j1', 1), jeton('j2', 1)]);
    let t = 1_790_000_000_000;
    const fournir = creerFournisseurJeton({
      emetteur: 'https://kc.test/realms/mbolo',
      client: 'mbolo-documents-service',
      // Clé en base64 sur une ligne, comme dans une variable d'environnement.
      authentification: { clePrivee: Buffer.from(pem).toString('base64') },
      fetch: f,
      maintenant: () => t,
    });
    expect(await fournir()).toEqual({ authorization: 'Bearer j1' });
    t += 5_000;
    expect(await fournir()).toEqual({ authorization: 'Bearer j2' });

    const assertions = [];
    for (const c of corps) {
      const p = new URLSearchParams(c);
      expect(p.get('client_secret')).toBeNull();
      expect(p.get('client_assertion_type')).toBe(
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      );
      const { payload } = await jwtVerify(p.get('client_assertion') ?? '', publicKey, {
        issuer: 'mbolo-documents-service',
        subject: 'mbolo-documents-service',
        audience: 'https://kc.test/realms/mbolo/protocol/openid-connect/token',
        currentDate: new Date(t),
      });
      expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(60);
      assertions.push(payload.jti);
    }
    // Un identifiant unique par assertion : Keycloak refuse une assertion rejouée.
    expect(new Set(assertions).size).toBe(2);
  });

  it('préfère la clé privée au secret dans l’environnement', () => {
    const env = {
      DOCUMENTS_SERVICE_CLE_PRIVEE: 'cle-fictive',
      DOCUMENTS_SERVICE_CLIENT_SECRET: SECRET,
    };
    expect(authentificationDepuis(env, 'DOCUMENTS')).toEqual({ clePrivee: 'cle-fictive' });
    expect(authentificationDepuis({ X_SERVICE_CLIENT_SECRET: SECRET }, 'X')).toEqual({
      secret: SECRET,
    });
    expect(authentificationDepuis({}, 'X')).toBeUndefined();
    expect(lirePem(Buffer.from('-----BEGIN X-----').toString('base64'))).toBe('-----BEGIN X-----');
  });
});
