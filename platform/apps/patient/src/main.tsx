import { render } from 'preact';
import { activerHorsLigne } from '@mbolo/client-web';
import { App } from './app.js';
import { appliquerLangueGardee } from './textes.js';

// Hors ligne et économie de données : seulement pour l'application construite (pas en développement).
if (import.meta.env.PROD) activerHorsLigne();

// La langue gardée sur le téléphone est appliquée avant le premier affichage (ADR-0025).
const racine = document.getElementById('app');
void appliquerLangueGardee().finally(() => {
  if (racine) render(<App />, racine);
});
