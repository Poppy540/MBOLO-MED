import { describe, expect, it } from 'vitest';
import { creerRequete, ErreurApi } from './api.js';
import { defiPkce, demarrerConnexion, terminerConnexion, type Memoire } from './auth.js';
import { quand, versInstant } from './format.js';
import { DecisionRepli } from './repli.js';

// Données FICTIVES.
const P = {
  emetteur: 'https://auth.fictif.example/realms/mbolo',
  client: 'mbolo-app-patient',
  retour: 'http://localhost:5180/',
};
const memoire = (): Memoire => {
  const m = new Map<string, string>();
  return {
    getItem: (c) => m.get(c) ?? null,
    setItem: (c, v) => void m.set(c, v),
    removeItem: (c) => void m.delete(c),
  };
};

describe('connexion PKCE', () => {
  it('calcule le défi S256 de la RFC 7636', async () => {
    expect(await defiPkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('échange le code avec le vérificateur, une seule fois, si l’état correspond', async () => {
    const m = memoire();
    const url = new URL(await demarrerConnexion(P, m));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const etat = url.searchParams.get('state') ?? '';
    const corps: URLSearchParams[] = [];
    const appeler = (async (_u: string, init: RequestInit) => {
      corps.push(init.body as URLSearchParams);
      return new Response(JSON.stringify({ access_token: 'jeton-fictif' }));
    }) as typeof fetch;
    const retour = new URL(`${P.retour}?code=code-fictif&state=${etat}`);
    expect(await terminerConnexion(P, retour, m, appeler)).toBe('jeton-fictif');
    expect(corps[0]?.get('code_verifier')).toBeTruthy();
    // La tentative est consommée : un second retour avec le même état est refusé.
    await expect(terminerConnexion(P, retour, m, appeler)).rejects.toThrow();
  });

  it('refuse un retour dont l’état ne correspond pas (CSRF)', async () => {
    const m = memoire();
    await demarrerConnexion(P, m);
    const retour = new URL(`${P.retour}?code=code-fictif&state=autre`);
    await expect(terminerConnexion(P, retour, m)).rejects.toThrow('état inattendu');
  });

  it('ignore une adresse qui n’est pas un retour de connexion', async () => {
    expect(await terminerConnexion(P, new URL(P.retour), memoire())).toBeUndefined();
  });
});

describe('API', () => {
  it('envoie le jeton et traduit les erreurs en messages simples', async () => {
    const entetes: HeadersInit[] = [];
    const appeler = (async (_u: string, init: RequestInit) => {
      entetes.push(init.headers ?? {});
      return new Response('{}', { status: 403 });
    }) as typeof fetch;
    const requete = creerRequete('/api', () => 'jeton-fictif', appeler);
    const e = await requete('GET', '/rendez-vous').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurApi);
    expect((e as ErreurApi).message).toContain('pas encore ouverte');
    expect(entetes[0]).toMatchObject({ authorization: 'Bearer jeton-fictif' });
  });
});

describe('dates', () => {
  it('au fuseau et dans la langue du pays déployé', () => {
    expect(quand('2026-10-01T08:00:00Z', 'Africa/Libreville', 'fr-FR')).toBe('jeu. 01/10 à 09:00');
    // Autre pays (ex. Sénégal, UTC+0) : même code, autre configuration.
    expect(quand('2026-10-01T08:00:00Z', 'Africa/Dakar', 'fr-FR')).toBe('jeu. 01/10 à 08:00');
  });

  it('convertit une date et une heure saisies dans le fuseau du pays en instant', () => {
    expect(versInstant('2026-10-01', '09:00', 'Africa/Libreville')).toBe(
      '2026-10-01T08:00:00.000Z',
    );
    expect(versInstant('2026-10-01', '09:00', 'Africa/Dakar')).toBe('2026-10-01T09:00:00.000Z');
    // Pays avec heure d'été (ex. diaspora en France) : été puis hiver.
    expect(versInstant('2026-07-01', '09:00', 'Europe/Paris')).toBe('2026-07-01T07:00:00.000Z');
    expect(versInstant('2026-12-01', '09:00', 'Europe/Paris')).toBe('2026-12-01T08:00:00.000Z');
    expect(() => versInstant('2026-13', '9h', 'Africa/Libreville')).toThrow();
  });
});

describe('repli audio automatique', () => {
  it('coupe la vidéo après 5 s de mauvaise qualité, ou aussitôt si la connexion est perdue', () => {
    const d = new DecisionRepli(5_000);
    expect(d.observer('poor', 0)).toBe(false);
    expect(d.observer('poor', 4_000)).toBe(false);
    expect(d.observer('poor', 5_000)).toBe(true);
    const e = new DecisionRepli(5_000);
    expect(e.observer('poor', 0)).toBe(false);
    expect(e.observer('good', 3_000)).toBe(false);
    expect(e.observer('poor', 6_000)).toBe(false);
    expect(new DecisionRepli().observer('lost', 0)).toBe(true);
  });
});
