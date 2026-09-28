// Espace professionnel (PWA faible débit). Port 5181 : les ports 5173 et 5174 servent de faux
// retours de connexion aux tests e2e. APIs servies sous /api/teleconsultation, /api/consultation, /api/documents et /api/paiement
// (même origine).
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

const api = process.env['TELECONSULTATION_URL'] ?? 'http://127.0.0.1:3003';
const consultation = process.env['CONSULTATION_URL'] ?? 'http://127.0.0.1:3005';
// Vérification d'identité des patients (ADR-0015).
const documents = process.env['DOCUMENTS_URL'] ?? 'http://127.0.0.1:3007';
// Remboursements à valider (ADR-0017).
const paiement = process.env['PAIEMENT_URL'] ?? 'http://127.0.0.1:3008';
const relais = (prefixe: string, cible: string) => ({
  target: cible,
  changeOrigin: true,
  rewrite: (chemin: string) => chemin.replace(new RegExp(`^${prefixe}`), ''),
});
const proxy = {
  '/api/teleconsultation': relais('/api/teleconsultation', api),
  '/api/consultation': relais('/api/consultation', consultation),
  '/api/documents': relais('/api/documents', documents),
  '/api/paiement': relais('/api/paiement', paiement),
};

export default defineConfig({
  plugins: [preact()],
  server: { host: 'localhost', port: 5181, strictPort: true, proxy },
  preview: { host: 'localhost', port: 5181, strictPort: true, proxy },
  // La bibliothèque vidéo (LiveKit) est volumineuse mais chargée à part, seulement pour rejoindre
  // une consultation ; le budget de l'ouverture est contrôlé par scripts/budget.mjs.
  build: { sourcemap: false, assetsInlineLimit: 0, chunkSizeWarningLimit: 700 },
});
