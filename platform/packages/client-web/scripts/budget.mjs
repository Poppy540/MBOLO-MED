// Budget de poids des applications web (skill optimisation-faible-debit, principe de D-0001 :
// faible débit par défaut). Mesuré après `vite build`, compressé gzip comme sur le réseau :
// - l'ouverture (HTML + JS + CSS chargés d'emblée) : ce que tout patient télécharge ;
// - chaque écran chargé à la demande (paiement, reçus, partages…) : ce qu'un clic coûte ;
// - la bibliothèque vidéo, téléchargée seulement pour rejoindre une consultation.
// Utilisé par les deux applications : `node ../../packages/client-web/scripts/budget.mjs dist`.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Plafonds en Ko compressés. */
export const PLAFONDS = { ouvertureKo: 30, ecranKo: 8, videoKo: 160 };

/** Fichier de la bibliothèque vidéo (LiveKit), mesuré à part. */
const estVideo = (nom) => nom.startsWith('livekit-client');

/**
 * Mesure un dossier `dist` construit par Vite : `[{ nom, ko, sorte }]`, `sorte` valant
 * `ouverture`, `ecran` ou `video`. Le HTML compte dans l'ouverture.
 */
export function mesurer(dist) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const ko = (chemin) => gzipSync(readFileSync(chemin)).length / 1024;
  const initiaux = new Set(
    [...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.(?:js|css))"/g)].map((m) => m[1]),
  );
  const mesures = [{ nom: 'index.html', ko: ko(join(dist, 'index.html')), sorte: 'ouverture' }];
  for (const nom of readdirSync(join(dist, 'assets')).sort()) {
    if (!/\.(?:js|css)$/.test(nom)) continue;
    const sorte = initiaux.has(nom) ? 'ouverture' : estVideo(nom) ? 'video' : 'ecran';
    mesures.push({ nom, ko: ko(join(dist, 'assets', nom)), sorte });
  }
  return mesures;
}

/** Dépassements, en phrases ; vide si le budget est tenu. */
export function verifier(mesures, plafonds = PLAFONDS) {
  const erreurs = [];
  const ouverture = mesures.filter((m) => m.sorte === 'ouverture').reduce((s, m) => s + m.ko, 0);
  if (ouverture > plafonds.ouvertureKo) {
    erreurs.push(`ouverture : ${ouverture.toFixed(1)} Ko (plafond ${plafonds.ouvertureKo} Ko)`);
  }
  for (const m of mesures) {
    const plafond =
      m.sorte === 'ecran' ? plafonds.ecranKo : m.sorte === 'video' ? plafonds.videoKo : undefined;
    if (plafond !== undefined && m.ko > plafond) {
      erreurs.push(`${m.nom} : ${m.ko.toFixed(1)} Ko (plafond ${plafond} Ko)`);
    }
  }
  return erreurs;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mesures = mesurer(resolve(process.argv[2] ?? 'dist'));
  const somme = (sorte) => mesures.filter((m) => m.sorte === sorte).reduce((s, m) => s + m.ko, 0);
  const ecrans = mesures.filter((m) => m.sorte === 'ecran');
  const plusLourd = ecrans.reduce((a, m) => (m.ko > a.ko ? m : a), { nom: '-', ko: 0 });
  process.stdout.write(
    `Budget : ${somme('ouverture').toFixed(1)} Ko à l'ouverture (plafond ${PLAFONDS.ouvertureKo} Ko), ` +
      `${ecrans.length} écrans à la demande (le plus lourd : ${plusLourd.nom}, ` +
      `${plusLourd.ko.toFixed(1)} Ko ; plafond ${PLAFONDS.ecranKo} Ko), ` +
      `vidéo ${somme('video').toFixed(1)} Ko (plafond ${PLAFONDS.videoKo} Ko).\n`,
  );
  const erreurs = verifier(mesures);
  if (erreurs.length > 0) {
    process.stderr.write(`Budget de poids dépassé :\n- ${erreurs.join('\n- ')}\n`);
    process.exit(1);
  }
}
