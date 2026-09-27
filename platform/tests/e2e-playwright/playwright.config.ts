// Tests de bout en bout de Mbolo Santé : Gherkin (français) → Playwright.
// Prérequis : Keycloak et HAPI FHIR locaux (docker-compose.yml de identite et dossier-fhir), `pnpm build`,
// IDENTITE_SERVICE_CLIENT_SECRET, TELECONSULTATION_SERVICE_CLIENT_SECRET et NOTIFICATIONS_SERVICE_CLIENT_SECRET et CONSULTATION_SERVICE_CLIENT_SECRET identiques à ceux donnés à Keycloak, et un Unleash local
// (UNLEASH_ADMIN_TOKEN, UNLEASH_BACKEND_TOKEN), et un LiveKit local (WEBRTC_API_KEY, WEBRTC_API_SECRET).
import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import {
  EMETTEUR,
  FHIR_URL,
  IDENTITE_URL,
  PASSERELLE_URL,
  APP_PATIENT_URL,
  APP_PRO_URL,
  CONSULTATION_URL,
  NOTIFICATIONS_URL,
  TELECONSULTATION_URL,
  UNLEASH_URL,
  WEBRTC_URL,
} from './configuration.js';

const testDir = defineBddConfig({
  featuresRoot: '../features-gherkin',
  features: '../features-gherkin/**/*.feature',
  steps: 'etapes/**/*.ts',
});

export default defineConfig({
  testDir,
  // Scénarios dépendants du même dossier de test : exécution séquentielle.
  workers: 1,
  // Une connexion par formulaire avec double authentification peut attendre la période OTP
  // suivante (30 s : Keycloak refuse de réutiliser un code) ; deux par scénario restent possibles.
  timeout: 90_000,
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: 'list',
  globalSetup: './preparation-globale.ts',
  // Pas de trace ni de vidéo : elles contiendraient des jetons et des mots de passe de test.
  use: {
    locale: 'fr-FR',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    // Micro et caméra simulés pour la visioconsultation (aucun média réel).
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  webServer: [
    {
      command: 'node ../../services/passerelle-fhir/dist/main.js',
      url: `${PASSERELLE_URL}/sante`,
      reuseExistingServer: false,
      env: {
        KEYCLOAK_ISSUER: EMETTEUR,
        FHIR_AMONT_URL: FHIR_URL,
        PORT: new URL(PASSERELLE_URL).port,
        MBOLO_ENV: 'dev',
      },
    },
    {
      command: 'node ../../services/identite/dist/main.js',
      url: `${IDENTITE_URL}/sante`,
      reuseExistingServer: false,
      env: {
        KEYCLOAK_ISSUER: EMETTEUR,
        FHIR_BASE_URL: `${PASSERELLE_URL}/fhir`,
        IDENTITE_SERVICE_CLIENT_SECRET: process.env['IDENTITE_SERVICE_CLIENT_SECRET'] ?? '',
        UNLEASH_API_URL: UNLEASH_URL,
        UNLEASH_BACKEND_TOKEN: process.env['UNLEASH_BACKEND_TOKEN'] ?? '',
        UNLEASH_REFRESH_MS: '500',
        PORT: new URL(IDENTITE_URL).port,
        MBOLO_ENV: 'dev',
      },
    },
    {
      command: 'node ../../services/teleconsultation/dist/main.js',
      url: `${TELECONSULTATION_URL}/sante`,
      reuseExistingServer: false,
      env: {
        KEYCLOAK_ISSUER: EMETTEUR,
        WEBRTC_SERVER_URL: WEBRTC_URL,
        FHIR_BASE_URL: `${PASSERELLE_URL}/fhir`,
        TELECONSULTATION_SERVICE_CLIENT_SECRET:
          process.env['TELECONSULTATION_SERVICE_CLIENT_SECRET'] ?? '',
        NOTIFICATIONS_URL,
        WEBRTC_API_KEY: process.env['WEBRTC_API_KEY'] ?? '',
        WEBRTC_API_SECRET: process.env['WEBRTC_API_SECRET'] ?? '',
        UNLEASH_API_URL: UNLEASH_URL,
        UNLEASH_BACKEND_TOKEN: process.env['UNLEASH_BACKEND_TOKEN'] ?? '',
        UNLEASH_REFRESH_MS: '500',
        PORT: new URL(TELECONSULTATION_URL).port,
        MBOLO_ENV: 'dev',
      },
    },
    {
      command: 'node ../../services/consultation/dist/main.js',
      url: `${CONSULTATION_URL}/sante`,
      reuseExistingServer: false,
      env: {
        KEYCLOAK_ISSUER: EMETTEUR,
        FHIR_BASE_URL: `${PASSERELLE_URL}/fhir`,
        IDENTITE_URL,
        CONSULTATION_SERVICE_CLIENT_SECRET: process.env['CONSULTATION_SERVICE_CLIENT_SECRET'] ?? '',
        PORT: new URL(CONSULTATION_URL).port,
        MBOLO_ENV: 'dev',
      },
    },
    {
      command: 'node ../../services/notifications/dist/main.js',
      url: `${NOTIFICATIONS_URL}/sante`,
      reuseExistingServer: false,
      env: {
        KEYCLOAK_ISSUER: EMETTEUR,
        FHIR_BASE_URL: `${PASSERELLE_URL}/fhir`,
        NOTIFICATIONS_SERVICE_CLIENT_SECRET:
          process.env['NOTIFICATIONS_SERVICE_CLIENT_SECRET'] ?? '',
        PORT: new URL(NOTIFICATIONS_URL).port,
        MBOLO_ENV: 'dev',
      },
    },
    {
      // Application patient construite par `pnpm build`, servie avec le relais vers l'API.
      command: 'pnpm exec vite preview',
      cwd: '../../apps/patient',
      url: APP_PATIENT_URL,
      reuseExistingServer: false,
      env: { TELECONSULTATION_URL },
    },
    {
      command: 'pnpm exec vite preview',
      cwd: '../../apps/professionnel',
      url: APP_PRO_URL,
      reuseExistingServer: false,
      env: { TELECONSULTATION_URL, CONSULTATION_URL },
    },
  ],
});
