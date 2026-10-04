import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appelReseau, creerRequete, ErreurApi, STATUT_RESEAU } from './api.js';
import {
  defiPkce,
  demarrerConnexion,
  niveauDuJeton,
  revendications,
  statutAction,
  terminerConnexion,
  type Memoire,
} from './auth.js';
import { quand, versInstant } from './format.js';
import {
  estHorsLigne,
  oublierRendezVous,
  rendezVousRetenus,
  retenirRendezVous,
} from './hors-ligne.js';
import { DecisionRepli, economiserDonnees } from './repli.js';

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

describe('inscription avec un code (ADR-0014)', () => {
  const p = {
    emetteur: 'http://kc.invalid/realms/mbolo',
    client: 'app',
    retour: 'http://app.invalid/',
  };
  const memoire = (): Memoire => {
    const m = new Map<string, string>();
    return {
      getItem: (c) => m.get(c) ?? null,
      setItem: (c, v) => m.set(c, v),
      removeItem: (c) => m.delete(c),
    };
  };

  it('ouvre le formulaire d’inscription de Keycloak, avec PKCE', async () => {
    const url = new URL(await demarrerConnexion(p, memoire(), true));
    expect(url.pathname).toBe('/realms/mbolo/protocol/openid-connect/registrations');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const connexion = new URL(await demarrerConnexion(p, memoire()));
    expect(connexion.pathname).toBe('/realms/mbolo/protocol/openid-connect/auth');
  });

  it('demande le niveau 2 (code SMS) seulement quand on le lui dit (ADR-0022)', async () => {
    const niveau2 = new URL(await demarrerConnexion(p, memoire(), false, 2));
    expect(niveau2.pathname).toBe('/realms/mbolo/protocol/openid-connect/auth');
    expect(niveau2.searchParams.get('acr_values')).toBe('2');
    expect(new URL(await demarrerConnexion(p, memoire())).searchParams.has('acr_values')).toBe(
      false,
    );
    const jeton = (acr: unknown) =>
      `e.${Buffer.from(JSON.stringify({ sub: 'x', acr })).toString('base64url')}.s`;
    expect(niveauDuJeton(jeton('2'))).toBe(2);
    expect(niveauDuJeton(jeton('1'))).toBe(1);
    // Absent, inattendu ou illisible : niveau 1, l'application redemande le code.
    for (const j of [jeton(undefined), jeton(2), jeton('2 '), 'pas-un-jeton', undefined]) {
      expect(niveauDuJeton(j)).toBe(1);
    }
  });

  it('lance une action Keycloak et lit son résultat au retour (ADR-0023)', async () => {
    const url = new URL(
      await demarrerConnexion(p, memoire(), false, undefined, 'mbolo-changer-telephone'),
    );
    expect(url.pathname).toBe('/realms/mbolo/protocol/openid-connect/auth');
    expect(url.searchParams.get('kc_action')).toBe('mbolo-changer-telephone');
    expect(url.searchParams.has('acr_values')).toBe(false);
    expect(new URL(await demarrerConnexion(p, memoire())).searchParams.has('kc_action')).toBe(
      false,
    );
    const retour = (s: string) => new URL(`http://127.0.0.1/?code=c&state=e&kc_action_status=${s}`);
    expect(statutAction(retour('success'))).toBe('success');
    expect(statutAction(retour('cancelled'))).toBe('cancelled');
    expect(statutAction(retour('error'))).toBe('error');
    // Absent ou inattendu : aucun message.
    expect(statutAction(retour('autre'))).toBeUndefined();
    expect(statutAction(new URL('http://127.0.0.1/?code=c'))).toBeUndefined();
  });

  it('lit les revendications d’un jeton pour l’affichage, sans planter sur un jeton illisible', () => {
    const corps = Buffer.from(JSON.stringify({ sub: 'x', patient_id: 'pat-fictif-é' })).toString(
      'base64url',
    );
    expect(revendications(`e.${corps}.s`)['patient_id']).toBe('pat-fictif-é');
    expect(revendications('pas-un-jeton')).toEqual({});
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

  it('envoie un PUT et accepte une réponse sans corps (204)', async () => {
    const appels: RequestInit[] = [];
    const appeler = (async (_url: string, init: RequestInit) => {
      appels.push(init);
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const r = await creerRequete('/api', () => 'jeton-fictif', appeler)('PUT', '/langue', {
      langue: 'fr',
    });
    expect(r).toBeUndefined();
    expect(appels[0]).toMatchObject({ method: 'PUT', body: '{"langue":"fr"}' });
  });

  it('dit « pas de réseau » quand aucune réponse n’arrive, au lieu de « service indisponible »', async () => {
    const appeler = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;
    const e = await creerRequete(
      '/api',
      () => undefined,
      appeler,
    )('GET', '/rendez-vous').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurApi);
    expect((e as ErreurApi).statut).toBe(STATUT_RESEAU);
    expect((e as ErreurApi).message).toBe(
      'Pas de réseau. Vérifiez votre connexion, puis réessayez.',
    );
    expect(estHorsLigne(e)).toBe(true);
  });

  it('abandonne une requête sans réponse après le délai, avec un avertissement pour un envoi', async () => {
    // Réponse qui n'arrive jamais, sauf abandon par le signal.
    const appeler = ((_u: string, init: RequestInit) =>
      new Promise((_ok, ko) => {
        init.signal?.addEventListener('abort', () => ko(new DOMException('abandon', 'AbortError')));
      })) as typeof fetch;
    const requete = creerRequete('/api', () => undefined, appeler, 20);
    const lecture = (await requete('GET', '/rendez-vous').catch((x: unknown) => x)) as ErreurApi;
    expect(lecture.statut).toBe(STATUT_RESEAU);
    expect(lecture.message).toBe('Le réseau est trop lent. Réessayez dans un moment.');
    expect(estHorsLigne(lecture)).toBe(true);
    const envoi = (await requete('POST', '/rendez-vous', {}).catch((x: unknown) => x)) as ErreurApi;
    expect(envoi.message).toContain('a peut-être été prise en compte');
  });

  it('appelReseau (écrans qui lisent eux-mêmes la réponse) : mêmes messages, même délai', async () => {
    const coupe = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;
    const e = (await appelReseau('/api/x', {}, 1000, coupe).catch((x: unknown) => x)) as ErreurApi;
    expect(e.statut).toBe(STATUT_RESEAU);
    expect(e.message).toBe('Pas de réseau. Vérifiez votre connexion, puis réessayez.');
    const muet = ((_u: string, init: RequestInit) =>
      new Promise((_ok, ko) => {
        init.signal?.addEventListener('abort', () => ko(new DOMException('abandon', 'AbortError')));
      })) as typeof fetch;
    const envoi = (await appelReseau('/api/x', { method: 'POST' }, 20, muet).catch(
      (x: unknown) => x,
    )) as ErreurApi;
    expect(envoi.message).toContain('a peut-être été prise en compte');
    // Une réponse du serveur, même un refus, est rendue telle quelle : l'écran lit son message.
    const refus = (async () =>
      new Response('{"erreur":"Refusé."}', { status: 409 })) as typeof fetch;
    expect((await appelReseau('/api/x', {}, 1000, refus)).status).toBe(409);
  });

  it('un refus du serveur n’est pas une erreur de réseau', async () => {
    const appeler = (async () => new Response('{}', { status: 503 })) as typeof fetch;
    const e = await creerRequete(
      '/api',
      () => undefined,
      appeler,
    )('GET', '/x').catch((x: unknown) => x);
    expect((e as ErreurApi).message).toBe('Service indisponible. Réessayez plus tard.');
    expect(estHorsLigne(e)).toBe(false);
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

describe('hors ligne', () => {
  const stockage = () => {
    const m = new Map<string, string>();
    return {
      getItem: (c: string) => m.get(c) ?? null,
      setItem: (c: string, v: string) => void m.set(c, v),
      removeItem: (c: string) => void m.delete(c),
      brut: () => [...m.values()].join(''),
    };
  };

  it('ne garde que l’identifiant, l’horaire et la durée ; oublie à la déconnexion', () => {
    const s = stockage();
    const avecExtras = {
      id: 'rdv-fictif-1',
      debut: '2026-10-01T08:00:00Z',
      dureeMinutes: 20,
      praticienId: 'prac-fictif-001',
      patientId: 'pat-fictif-001',
    };
    retenirRendezVous(s, [avecExtras], new Date('2026-09-30T10:00:00Z'));
    expect(rendezVousRetenus(s)).toEqual({
      date: '2026-09-30T10:00:00.000Z',
      liste: [{ id: 'rdv-fictif-1', debut: '2026-10-01T08:00:00Z', dureeMinutes: 20 }],
    });
    expect(s.brut()).not.toContain('fictif-00');
    oublierRendezVous(s);
    expect(rendezVousRetenus(s)).toBeUndefined();
  });

  it('un stockage indisponible (navigation privée) ne casse rien', () => {
    const plein = {
      getItem: () => {
        throw new Error('interdit');
      },
      setItem: () => {
        throw new Error('plein');
      },
      removeItem: () => undefined,
    };
    expect(() => retenirRendezVous(plein, [])).not.toThrow();
    expect(rendezVousRetenus(plein)).toBeUndefined();
  });

  it('le service worker est le même dans les deux applications et ne met jamais l’API en cache', () => {
    const lire = (chemin: string) => readFileSync(new URL(chemin, import.meta.url), 'utf8');
    const source = lire('./sw.js');
    expect(lire('../../../apps/patient/public/sw.js')).toBe(source);
    expect(lire('../../../apps/professionnel/public/sw.js')).toBe(source);
    expect(source).toContain("url.pathname.startsWith('/api/')) return;");
    expect(source).toContain('url.origin !== self.location.origin) return;');
  });
});

describe('économie de données (consultation en audio seulement au départ)', () => {
  it('commence en audio seulement si le téléphone économise les données ou si le réseau est en 2G', () => {
    expect(economiserDonnees({ saveData: true, effectiveType: '4g' })).toBe(true);
    expect(economiserDonnees({ effectiveType: '2g' })).toBe(true);
    expect(economiserDonnees({ effectiveType: 'slow-2g' })).toBe(true);
  });

  it('commence en vidéo sinon, et quand le navigateur ne dit rien du réseau', () => {
    expect(economiserDonnees({ saveData: false, effectiveType: '3g' })).toBe(false);
    expect(economiserDonnees({ effectiveType: '4g' })).toBe(false);
    expect(economiserDonnees({})).toBe(false);
    expect(economiserDonnees(undefined)).toBe(false);
  });
});
