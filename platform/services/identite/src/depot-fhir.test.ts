import type { Bundle, Consent } from 'fhir/r4.js';
import { describe, expect, it } from 'vitest';
import { DepotFhir, ErreurDepot } from './depot-fhir.js';
import { sansBarreFinale } from './client-fhir.js';

// Données FICTIVES. Faux serveur FHIR : enregistre les requêtes et renvoie des réponses préparées.
const BASE = 'http://fhir.test/fhir';
const consent = (id?: string, patient = 'pat-fictif-001', version = '1'): Consent => ({
  resourceType: 'Consent',
  ...(id ? { id, meta: { versionId: version } } : {}),
  status: 'active',
  scope: { text: 'patient-privacy' },
  category: [{ text: 'C-SOINS' }],
  patient: { reference: `Patient/${patient}` },
});

interface Appel {
  url: string;
  methode: string;
  entetes: Record<string, string>;
  corps?: unknown;
}

function fauxServeur(reponses: (Response | Error)[]) {
  const appels: Appel[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    appels.push({
      url: String(url),
      methode: init?.method ?? 'GET',
      entetes: (init?.headers ?? {}) as Record<string, string>,
      ...(init?.body ? { corps: JSON.parse(String(init.body)) as unknown } : {}),
    });
    const r = reponses.shift();
    if (!r || r instanceof Error) throw r ?? new Error('aucune réponse préparée');
    return r;
  }) as typeof fetch;
  return { appels, f };
}

const json = (statut: number, corps: unknown) =>
  new Response(JSON.stringify(corps), { status: statut });

describe('DepotFhir', () => {
  it('crée le consentement par POST et renvoie la ressource du serveur', async () => {
    const { appels, f } = fauxServeur([json(201, consent('12'))]);
    const depot = new DepotFhir({ base: `${BASE}/`, fetch: f });
    const cree = await depot.ajouter(consent());
    expect(cree.id).toBe('12');
    expect(appels[0]).toMatchObject({
      url: `${BASE}/Consent`,
      methode: 'POST',
      entetes: { 'content-type': 'application/fhir+json', prefer: 'return=representation' },
    });
  });

  it('ajoute les en-têtes d’authentification fournis', async () => {
    const { appels, f } = fauxServeur([json(200, consent('12'))]);
    const depot = new DepotFhir({
      base: BASE,
      fetch: f,
      entetes: async () => ({ authorization: 'Bearer jeton-de-test' }),
    });
    await depot.lire('12');
    expect(appels[0]?.entetes['authorization']).toBe('Bearer jeton-de-test');
  });

  it('signale en 503 un jeton de service impossible à obtenir, sans appeler le dossier', async () => {
    const { appels, f } = fauxServeur([]);
    const depot = new DepotFhir({
      base: BASE,
      fetch: f,
      entetes: async () => {
        throw new Error('Keycloak injoignable');
      },
    });
    await expect(depot.lire('12')).rejects.toMatchObject({ statut: 503 });
    expect(appels).toHaveLength(0);
  });

  it('renvoie undefined pour un consentement absent ou supprimé', async () => {
    const { f } = fauxServeur([json(404, {}), json(410, {})]);
    const depot = new DepotFhir({ base: BASE, fetch: f });
    expect(await depot.lire('absent')).toBeUndefined();
    expect(await depot.lire('supprime')).toBeUndefined();
  });

  it('refuse une réponse qui n’est pas un Consent', async () => {
    const { f } = fauxServeur([json(200, { resourceType: 'Patient', id: '12' })]);
    await expect(new DepotFhir({ base: BASE, fetch: f }).lire('12')).rejects.toMatchObject({
      statut: 503,
    });
  });

  it('remplace avec un verrou optimiste (If-Match) et signale un conflit en 409', async () => {
    const { appels, f } = fauxServeur([json(200, consent('12', undefined, '2')), json(412, {})]);
    const depot = new DepotFhir({ base: BASE, fetch: f });
    await depot.remplacer(consent('12', undefined, '1'));
    expect(appels[0]).toMatchObject({
      url: `${BASE}/Consent/12`,
      methode: 'PUT',
      entetes: { 'if-match': 'W/"1"' },
    });
    await expect(depot.remplacer(consent('12'))).rejects.toMatchObject({ statut: 409 });
  });

  it('traduit un refus du serveur (référence inconnue) en 422, sans détail', async () => {
    const { f } = fauxServeur([json(400, { resourceType: 'OperationOutcome' })]);
    const erreur = await new DepotFhir({ base: BASE, fetch: f })
      .ajouter(consent())
      .catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurDepot);
    expect(erreur).toMatchObject({
      statut: 422,
      message: 'Consentement refusé par le dossier médical.',
    });
  });

  it('signale un serveur injoignable en 503', async () => {
    const { f } = fauxServeur([new TypeError('fetch failed')]);
    await expect(new DepotFhir({ base: BASE, fetch: f }).lire('12')).rejects.toMatchObject({
      statut: 503,
    });
  });

  it('liste les consentements du patient en suivant les pages du même serveur', async () => {
    const page1: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      link: [{ relation: 'next', url: `${BASE}?_getpages=abc` }],
      entry: [{ resource: consent('1') }, { resource: consent('x', 'pat-fictif-002') }],
    };
    const page2: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: consent('2') }],
    };
    const { appels, f } = fauxServeur([json(200, page1), json(200, page2)]);
    const liste = await new DepotFhir({ base: BASE, fetch: f }).parPatient('pat-fictif-001');
    // La ressource d'un autre patient, même renvoyée par le serveur, est écartée.
    expect(liste.map((c) => c.id)).toEqual(['1', '2']);
    expect(appels[0]?.url).toBe(`${BASE}/Consent?patient=Patient%2Fpat-fictif-001&_count=100`);
    // Une révocation doit être vue tout de suite : pas de résultat de recherche mis en cache.
    expect(appels.every((a) => a.entetes['cache-control'] === 'no-cache')).toBe(true);
    expect(appels[1]?.url).toBe(`${BASE}?_getpages=abc`);
  });

  it('ne suit pas un lien de page vers un autre serveur', async () => {
    const page: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      link: [{ relation: 'next', url: 'http://ailleurs.test/fhir?page=2' }],
      entry: [{ resource: consent('1') }],
    };
    const { appels, f } = fauxServeur([json(200, page)]);
    await new DepotFhir({ base: BASE, fetch: f }).parPatient('pat-fictif-001');
    expect(appels).toHaveLength(1);
  });
});

describe('sansBarreFinale', () => {
  it('retire les « / » finaux, même très nombreux, sans toucher au reste', () => {
    expect(sansBarreFinale('http://fhir.exemple.invalid/fhir///')).toBe(
      'http://fhir.exemple.invalid/fhir',
    );
    expect(sansBarreFinale('http://fhir.exemple.invalid/fhir')).toBe(
      'http://fhir.exemple.invalid/fhir',
    );
    const longue = `http://a${'/'.repeat(100_000)}`;
    expect(sansBarreFinale(longue)).toBe('http://a');
  });
});
