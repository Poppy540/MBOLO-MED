// Écrit les fichiers de règles générés (pnpm --filter @mbolo/supervision generer).
import { writeFileSync } from 'node:fs';
import { fichiersRegles } from './fichiers.js';

for (const [chemin, contenu] of Object.entries(fichiersRegles())) {
  writeFileSync(new URL(`../${chemin}`, import.meta.url), contenu);
}
