// Budget de poids (skill optimisation-faible-debit) : ce qui est téléchargé à l'ouverture
// (HTML + JS + CSS initiaux, compressés gzip) doit rester sous le plafond. La bibliothèque vidéo,
// chargée seulement pour rejoindre une consultation, est mesurée à part.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import process from 'node:process';
import { URL } from 'node:url';

const PLAFOND_INITIAL_KO = 30;
const dist = new URL('../dist/', import.meta.url).pathname;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const taille = (f) => gzipSync(readFileSync(f)).length / 1024;

const initiaux = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map(
  (m) => m[1],
);
const initial =
  taille(join(dist, 'index.html')) + initiaux.reduce((s, f) => s + taille(join(dist, f)), 0);
const differes = readdirSync(join(dist, 'assets'))
  .filter((f) => f.endsWith('.js') && !initiaux.includes(`assets/${f}`))
  .reduce((s, f) => s + taille(join(dist, 'assets', f)), 0);

process.stdout.write(
  `Budget : ${initial.toFixed(1)} Ko à l'ouverture (plafond ${PLAFOND_INITIAL_KO} Ko), ` +
    `${differes.toFixed(1)} Ko chargés seulement pour la vidéo.\n`,
);
if (initial > PLAFOND_INITIAL_KO) {
  process.stderr.write('Budget de poids dépassé à l’ouverture.\n');
  process.exit(1);
}
