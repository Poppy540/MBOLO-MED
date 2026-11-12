import type { AuditEvent, Bundle } from 'fhir/r4.js';
import { describe, expect, it } from 'vitest';
import { JournalAccesFhir } from './journal-acces.js';

// Données FICTIVES. Faux serveur FHIR.
const BASE = 'http://fhir.test/fhir';
const trace = (date: string, patient = 'pat-fictif-001'): AuditEvent => ({
  resourceType: 'AuditEvent',
  type: { code: '110110' },
  recorded: date,
  agent: [{ requestor: true }],
  source: { observer: { display: 'identite' } },
  entity: [{ what: { reference: `Patient/${patient}` } }],
});

function fauxServeur(reponses: Response[]) {
  const appels: { url: string; methode: string; entetes: Record<string, string> }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    appels.push({
      url: String(url),
      methode: init?.method ?? 'GET',
      entetes: (init?.headers ?? {}) as Record<string, string>,
    });
    const r = reponses.shift();
    if (!r) throw new TypeError('fetch failed');
    return r;
  }) as typeof fetch;
  return { appels, f };
}

describe('JournalAccesFhir', () => {
  it('consigne par POST un AuditEvent', async () => {
    const { appels, f } = fauxServeur([new Response(null, { status: 201 })]);
    await new JournalAccesFhir({ base: BASE, fetch: f }).consigner(trace('2026-09-27T08:00:00Z'));
    expect(appels[0]).toMatchObject({ url: `${BASE}/AuditEvent`, methode: 'POST' });
  });

  it('503 si le dossier ne répond pas (un accès ne sera pas accordé sans trace)', async () => {
    const { f } = fauxServeur([]);
    await expect(
      new JournalAccesFhir({ base: BASE, fetch: f }).consigner(trace('2026-09-27T08:00:00Z')),
    ).rejects.toMatchObject({ statut: 503 });
  });

  it('liste les traces du patient, sans cache, plus récentes d’abord, en écartant les autres patients', async () => {
    const lot: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        { resource: trace('2026-09-27T08:00:00Z') },
        { resource: trace('2026-09-27T09:00:00Z', 'pat-fictif-002') },
        { resource: trace('2026-09-27T10:00:00Z') },
      ],
    };
    const { appels, f } = fauxServeur([new Response(JSON.stringify(lot), { status: 200 })]);
    const traces = await new JournalAccesFhir({ base: BASE, fetch: f }).parPatient(
      'pat-fictif-001',
    );
    expect(traces.map((t) => t.recorded)).toEqual(['2026-09-27T10:00:00Z', '2026-09-27T08:00:00Z']);
    expect(appels[0]?.url).toContain('/AuditEvent?patient=Patient%2Fpat-fictif-001');
    expect(appels[0]?.entetes['cache-control']).toBe('no-cache');
  });
});

describe('JournalAccesFhir.parCompte', () => {
  const SYSTEME = 'https://mbolo-sante.example/fhir/identifiant-compte';
  const deCompte = (date: string, sujet: string): AuditEvent => ({
    ...trace(date),
    agent: [{ requestor: true, who: { identifier: { system: SYSTEME, value: sujet } } }],
  });

  it('cherche par identifiant du compte et date, sans cache, et écarte ce qui ne correspond pas', async () => {
    const lot: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        { resource: deCompte('2026-11-02T03:00:00Z', 'u-vole') },
        { resource: deCompte('2026-11-02T04:00:00Z', 'u-autre') },
        { resource: deCompte('2026-11-02T01:00:00Z', 'u-vole') },
        { resource: deCompte('2026-11-02T05:00:00Z', 'u-vole') },
      ],
    };
    const { appels, f } = fauxServeur([new Response(JSON.stringify(lot), { status: 200 })]);
    const traces = await new JournalAccesFhir({ base: BASE, fetch: f }).parCompte(
      'u-vole',
      '2026-11-02T02:00:00.000Z',
    );
    expect(traces.map((t) => t.recorded)).toEqual(['2026-11-02T05:00:00Z', '2026-11-02T03:00:00Z']);
    const url = decodeURIComponent(appels[0]?.url ?? '');
    expect(url).toContain('/AuditEvent?altid=u-vole&');
    expect(url).toContain('date=ge2026-11-02T02:00:00.000Z');
    expect(appels[0]?.entetes['cache-control']).toBe('no-cache');
  });
});
