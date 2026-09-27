import { render } from 'preact';
import { activerHorsLigne } from '@mbolo/client-web';
import { App } from './app.js';

// Hors ligne et économie de données : seulement pour l'application construite (pas en développement).
if (import.meta.env.PROD) activerHorsLigne();

const racine = document.getElementById('app');
if (racine) render(<App />, racine);
