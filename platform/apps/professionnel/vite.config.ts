// Espace professionnel (PWA faible débit). Port 5181 : les ports 5173 et 5174 servent de faux
// retours de connexion aux tests e2e. APIs servies sous /api/teleconsultation, /api/consultation, /api/documents, /api/paiement
// et /api/invitations (même origine).
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';
// Chemin relatif : la configuration Vite est compilée avec lui (pas d'import TypeScript par Node).
import { avecCsp } from '../../packages/client-web/src/csp.js';

// Revue ASVS n°1 (C6) : politique de sécurité du contenu, posée dans la page construite seulement
// (le serveur de développement en a besoin d'une plus large). Keycloak et la visio : mêmes
// variables que l'application ; en-têtes complets (frame-ancestors, HSTS) sur l'hébergement.
const csp: Plugin = {
  name: 'mbolo-csp',
  apply: 'build',
  // En dernier : l'empreinte porte sur le style tel qu'il sera servi.
  transformIndexHtml: {
    order: 'post',
    handler: (html) =>
      avecCsp(html, {
        emetteur: process.env['VITE_KEYCLOAK_ISSUER'] ?? 'http://127.0.0.1:8081/realms/mbolo',
        webrtc: process.env['VITE_WEBRTC_URL'] ?? 'ws://127.0.0.1:7880',
      }),
  },
};

const api = process.env['TELECONSULTATION_URL'] ?? 'http://127.0.0.1:3003';
const consultation = process.env['CONSULTATION_URL'] ?? 'http://127.0.0.1:3005';
// Vérification d'identité des patients (ADR-0015).
const documents = process.env['DOCUMENTS_URL'] ?? 'http://127.0.0.1:3007';
// Remboursements à valider (ADR-0017).
const paiement = process.env['PAIEMENT_URL'] ?? 'http://127.0.0.1:3008';
// Retrait des proches par l'équipe d'assistance (ADR-0019).
const invitations = process.env['INVITATIONS_URL'] ?? 'http://127.0.0.1:3006';
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
  '/api/invitations': relais('/api/invitations', invitations),
};

export default defineConfig({
  plugins: [preact(), csp],
  server: { host: 'localhost', port: 5181, strictPort: true, proxy },
  preview: { host: 'localhost', port: 5181, strictPort: true, proxy },
  // La bibliothèque vidéo (LiveKit) est volumineuse mais chargée à part, seulement pour rejoindre
  // une consultation ; le budget de l'ouverture est contrôlé par scripts/budget.mjs.
  build: { sourcemap: false, assetsInlineLimit: 0, chunkSizeWarningLimit: 700 },
});
