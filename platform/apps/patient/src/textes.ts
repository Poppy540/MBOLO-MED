// Textes de l'application patient dans la langue choisie par le patient (ADR-0025). Le français est
// la référence, toujours dans le paquet d'ouverture ; chaque autre langue est un catalogue chargé à la
// demande, proposé seulement s'il est cité dans VITE_LANGUES. Un texte pas encore traduit s'affiche en
// français. Les écrans chargés à la demande gardent leur catalogue français tant qu'aucune langue
// réelle n'est validée.
import { creerTraducteur, type Traduction } from '@mbolo/client-web';
import { CONFIG } from './config.js';
import { garderLangue, LANGUE_DE_REFERENCE, langueGardee, languesProposees } from './langues.js';
import { fr } from './textes-fr.js';

export type { CleTexte } from './textes-fr.js';

const CATALOGUES: Readonly<Record<string, () => Promise<Traduction<typeof fr>>>> = {
  // Démonstration [FICTIF] pour tester le parcours sans attendre les traducteurs (jamais en production).
  'fr-x-fictif': () => import('./textes-fictif.js').then((m) => m.fictif),
};

export const LANGUES = languesProposees(CONFIG.langues, [
  LANGUE_DE_REFERENCE.code,
  ...Object.keys(CATALOGUES),
]);

const stockage = (): Storage | undefined => {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
};

// Le français, langue de référence, suit les formats du pays (pluriels de VITE_LANGUE).
export let t = creerTraducteur(fr, CONFIG.langue);
export let langueChoisie = LANGUE_DE_REFERENCE.code;

/**
 * Passe l'application dans la langue `code` et garde ce choix sur le téléphone. Si le catalogue ne
 * se charge pas (pas de réseau à la première fois), l'application reste dans sa langue actuelle.
 */
export async function choisirLangue(code: string): Promise<void> {
  if (!LANGUES.some((l) => l.code === code)) return;
  const charger = CATALOGUES[code];
  let traduction: Traduction<typeof fr> | undefined;
  if (charger) {
    try {
      traduction = await charger();
    } catch {
      return;
    }
  }
  t = traduction ? creerTraducteur(fr, code, traduction) : creerTraducteur(fr, CONFIG.langue);
  langueChoisie = code;
  document.documentElement.lang = code;
  garderLangue(stockage(), code);
}

/** Au démarrage : la langue gardée sur le téléphone, ou la première langue du pays. */
export async function appliquerLangueGardee(): Promise<void> {
  const code = langueGardee(stockage(), LANGUES);
  if (code !== langueChoisie) await choisirLangue(code);
}
