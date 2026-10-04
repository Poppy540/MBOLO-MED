import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Les actions clés ont des pictogrammes SVG (`Picto` de @mbolo/client-web, ADR-0025) : un émoji
// change d'un téléphone à l'autre, ou s'affiche en carré vide sur les anciens Android.
const EMOJIS_REMPLACES = [
  '🚑',
  '🚨',
  '📅',
  '💳',
  '📹',
  '🎥',
  '🔈',
  '📞',
  '💊',
  '🔒',
  '🤝',
  '👨‍👩‍👧',
  '📴',
];

const dossier = new URL('.', import.meta.url).pathname;
const ecrans = readdirSync(dossier).filter((f) => f.endsWith('.tsx'));

describe('pictogrammes des actions clés dans l’application patient', () => {
  it.each(ecrans)('%s : aucun émoji remplacé par un pictogramme', (f) => {
    const code = readFileSync(join(dossier, f), 'utf8');
    expect(EMOJIS_REMPLACES.filter((e) => code.includes(e))).toEqual([]);
  });
});
