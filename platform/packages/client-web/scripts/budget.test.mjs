import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PLAFONDS, mesurer, verifier } from './budget.mjs';

const dossiers = [];
afterEach(() => {
  for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Construit un faux `dist` ; les contenus aléatoires ne se compressent pas (taille ≈ réelle). */
function dist(fichiers, html) {
  const d = mkdtempSync(join(tmpdir(), 'budget-'));
  dossiers.push(d);
  mkdirSync(join(d, 'assets'));
  writeFileSync(join(d, 'index.html'), html);
  for (const [nom, octets] of Object.entries(fichiers)) {
    const contenu = Array.from({ length: octets }, () =>
      String.fromCharCode(33 + Math.floor(Math.random() * 90)),
    ).join('');
    writeFileSync(join(d, 'assets', nom), contenu);
  }
  return d;
}

describe('budget de poids', () => {
  it('classe l’ouverture, les écrans à la demande et la vidéo', () => {
    const d = dist(
      { 'index-a.js': 1000, 'recus-b.js': 500, 'livekit-client.esm-c.js': 500 },
      '<script type="module" src="/assets/index-a.js"></script>',
    );
    const sortes = Object.fromEntries(mesurer(d).map((m) => [m.nom, m.sorte]));
    expect(sortes).toEqual({
      'index.html': 'ouverture',
      'index-a.js': 'ouverture',
      'recus-b.js': 'ecran',
      'livekit-client.esm-c.js': 'video',
    });
  });

  it('accepte un budget tenu', () => {
    expect(
      verifier([
        { nom: 'index.html', ko: 1, sorte: 'ouverture' },
        { nom: 'index-a.js', ko: 20, sorte: 'ouverture' },
        { nom: 'recus-b.js', ko: PLAFONDS.ecranKo, sorte: 'ecran' },
        { nom: 'livekit-client.esm-c.js', ko: 150, sorte: 'video' },
      ]),
    ).toEqual([]);
  });

  it('refuse une ouverture, un écran ou une vidéo trop lourds, en les nommant', () => {
    const erreurs = verifier([
      { nom: 'index-a.js', ko: 31, sorte: 'ouverture' },
      { nom: 'partages-b.js', ko: 9, sorte: 'ecran' },
      { nom: 'livekit-client.esm-c.js', ko: 161, sorte: 'video' },
    ]);
    expect(erreurs).toHaveLength(3);
    expect(erreurs[0]).toMatch(/^ouverture : 31\.0 Ko/);
    expect(erreurs[1]).toMatch(/^partages-b\.js : 9\.0 Ko/);
    expect(erreurs[2]).toMatch(/^livekit-client/);
  });
});
