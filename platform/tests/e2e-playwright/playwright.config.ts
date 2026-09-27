// Tests de bout en bout de Mbolo Santé : Gherkin (français) → Playwright.
// Prérequis : Keycloak et HAPI FHIR locaux (docker-compose.yml de identite et dossier-fhir), `pnpm build`.
import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import { EMETTEUR, FHIR_URL, IDENTITE_URL } from './configuration.js';

const testDir = defineBddConfig({
  featuresRoot: '../features-gherkin',
  features: '../features-gherkin/**/*.feature',
  steps: 'etapes/**/*.ts',
});

export default defineConfig({
  testDir,
  // Le service identité garde les consentements en mémoire : exécution séquentielle.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: 'list',
  globalSetup: './preparation-globale.ts',
  // Pas de trace ni de vidéo : elles contiendraient des jetons et des mots de passe de test.
  use: { locale: 'fr-FR', trace: 'off', video: 'off', screenshot: 'off' },
  webServer: {
    command: 'node ../../services/identite/dist/main.js',
    url: `${IDENTITE_URL}/sante`,
    reuseExistingServer: false,
    env: {
      KEYCLOAK_ISSUER: EMETTEUR,
      FHIR_BASE_URL: FHIR_URL,
      PORT: new URL(IDENTITE_URL).port,
      MBOLO_ENV: 'dev',
    },
  },
});
