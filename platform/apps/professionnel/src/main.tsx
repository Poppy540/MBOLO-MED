import { render } from 'preact';
import { App } from './app.js';

const racine = document.getElementById('app');
if (racine) render(<App />, racine);
