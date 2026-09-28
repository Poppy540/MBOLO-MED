// Application patient (PWA faible débit). Port 5180 : les ports 5173 et 5174 servent de faux
// retours de connexion aux tests e2e. Les API (téléconsultation, consultation, identite, documents, paiement) sont servies sous /api/<service> (même origine).
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

// Relais de même origine vers chaque API : /api/<service>/… → <service>/…
const relais = (service: string, cible: string) => ({
  [`/api/${service}`]: {
    target: cible,
    changeOrigin: true,
    rewrite: (chemin: string) => chemin.replace(new RegExp(`^/api/${service}`), ''),
  },
});
const proxy = {
  ...relais('teleconsultation', process.env['TELECONSULTATION_URL'] ?? 'http://127.0.0.1:3003'),
  // Charte d'identité (consentement C-IDENTITE) et photos d'identité (ADR-0015).
  ...relais('identite', process.env['IDENTITE_URL'] ?? 'http://127.0.0.1:3001'),
  ...relais('documents', process.env['DOCUMENTS_URL'] ?? 'http://127.0.0.1:3007'),
  // Comptes-rendus et ordonnances du patient (lecture seule).
  ...relais('consultation', process.env['CONSULTATION_URL'] ?? 'http://127.0.0.1:3005'),
  // Paiement par mobile money (ADR-0017).
  ...relais('paiement', process.env['PAIEMENT_URL'] ?? 'http://127.0.0.1:3008'),
};

export default defineConfig({
  plugins: [preact()],
  server: { host: 'localhost', port: 5180, strictPort: true, proxy },
  preview: { host: 'localhost', port: 5180, strictPort: true, proxy },
  // La bibliothèque vidéo (LiveKit) est volumineuse mais chargée à part, seulement pour rejoindre
  // une consultation ; le budget de l'ouverture est contrôlé par scripts/budget.mjs.
  build: { sourcemap: false, assetsInlineLimit: 0, chunkSizeWarningLimit: 700 },
});
