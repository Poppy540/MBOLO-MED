// Textes de l'application patient dans la langue du pays (ADR-0025). Pour l'instant, seul le français
// existe ; le choix de la langue par le patient arrive avec la PR suivante.
import { creerTraducteur } from '@mbolo/client-web';
import { CONFIG } from './config.js';
import { fr } from './textes-fr.js';

export type { CleTexte } from './textes-fr.js';

export const t = creerTraducteur(fr, CONFIG.langue);
