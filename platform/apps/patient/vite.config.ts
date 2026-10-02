// Application patient (PWA faible débit). Port 5180 : les ports 5173 et 5174 servent de faux
// retours de connexion aux tests e2e. Les API (téléconsultation, consultation, identite, documents, invitations, paiement) sont servies sous /api/<service> (même origine).
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
  // Invitation des proches par le patient (ADR-0019).
  ...relais('invitations', process.env['INVITATIONS_URL'] ?? 'http://127.0.0.1:3006'),
  // Paiement par mobile money (ADR-0017).
  ...relais('paiement', process.env['PAIEMENT_URL'] ?? 'http://127.0.0.1:3008'),
};

export default defineConfig({
  plugins: [preact(), csp],
  server: { host: 'localhost', port: 5180, strictPort: true, proxy },
  preview: { host: 'localhost', port: 5180, strictPort: true, proxy },
  // La bibliothèque vidéo (LiveKit) est volumineuse mais chargée à part, seulement pour rejoindre
  // une consultation ; le budget de poids est contrôlé par `@mbolo/client-web` (scripts/budget.mjs).
  build: { sourcemap: false, assetsInlineLimit: 0, chunkSizeWarningLimit: 700 },
});
