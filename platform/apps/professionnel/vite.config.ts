// Espace professionnel (PWA faible débit). Port 5181 : les ports 5173 et 5174 servent de faux
// retours de connexion aux tests e2e. L'API de téléconsultation est servie sous /api/teleconsultation (même origine).
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

const api = process.env['TELECONSULTATION_URL'] ?? 'http://127.0.0.1:3003';
const proxy = {
  '/api/teleconsultation': {
    target: api,
    changeOrigin: true,
    rewrite: (chemin: string) => chemin.replace(/^\/api\/teleconsultation/, ''),
  },
};

export default defineConfig({
  plugins: [preact()],
  server: { host: 'localhost', port: 5181, strictPort: true, proxy },
  preview: { host: 'localhost', port: 5181, strictPort: true, proxy },
  // La bibliothèque vidéo (LiveKit) est volumineuse mais chargée à part, seulement pour rejoindre
  // une consultation ; le budget de l'ouverture est contrôlé par scripts/budget.mjs.
  build: { sourcemap: false, assetsInlineLimit: 0, chunkSizeWarningLimit: 700 },
});
