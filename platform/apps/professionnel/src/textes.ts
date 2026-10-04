// Textes de l'espace professionnel (ADR-0025). Pour l'instant, seul le français existe ; l'anglais
// est une question ouverte au porteur de projet (ADR-0025, question 2).
import { creerTraducteur } from '@mbolo/client-web';
import { CONFIG } from './config.js';
import { fr } from './textes-fr.js';

export type { CleTexte } from './textes-fr.js';

export const t = creerTraducteur(fr, CONFIG.langue);
