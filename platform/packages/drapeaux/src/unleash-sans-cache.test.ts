// Garde-fou de l'exception de sécurité FP-2026-001 (GHSA-ch52-4w7c-c8xp, `http-cache-semantics`,
// arrivé par `unleash-client` → `make-fetch-happen`). La faille ne touche qu'un cache HTTP ; elle
// est acceptée parce que `unleash-client` n'en active aucun. Si une mise à jour en active un, ce test
// échoue : réexaminer l'exception (docs/securite/scans.md) avant toute fusion.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dossier = dirname(createRequire(import.meta.url).resolve('unleash-client'));
const sources = (readdirSync(dossier, { recursive: true }) as string[])
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(dossier, f), 'utf8'));

describe('unleash-client sans cache HTTP (exception FP-2026-001)', () => {
  it('appelle bien make-fetch-happen (le test regarde le bon code)', () => {
    expect(sources.some((s) => s.includes('make-fetch-happen'))).toBe(true);
  });

  it('ne lui donne jamais d’emplacement ni de gestionnaire de cache', () => {
    expect(sources.filter((s) => /cachePath|cacheManager/.test(s))).toEqual([]);
  });
});
