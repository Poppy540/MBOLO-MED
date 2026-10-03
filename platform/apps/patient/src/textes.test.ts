import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fr } from './textes-fr.js';

// Chaque texte du catalogue est traduit et validé dans chaque langue (ADR-0025) : un texte qui n'est
// plus affiché coûterait une traduction pour rien. Les clés sont cherchées dans le code des écrans.
const dossier = new URL('.', import.meta.url).pathname;
const code = readdirSync(dossier)
  .filter((f) => f.endsWith('.tsx') || (f.endsWith('.ts') && !f.startsWith('textes')))
  .map((f) => readFileSync(join(dossier, f), 'utf8'))
  .join('\n');

describe('catalogue français de l’application patient', () => {
  it('chaque clé est utilisée par un écran', () => {
    const inutilisees = Object.keys(fr).filter((cle) => !code.includes(`'${cle}'`));
    expect(inutilisees).toEqual([]);
  });

  it('aucun texte n’est vide', () => {
    expect(Object.entries(fr).filter(([, v]) => v.trim() === '')).toEqual([]);
  });
});
