// Tests de bout en bout de Mbolo Santé : Gherkin (français) → Playwright.
// Prérequis : Keycloak et HAPI FHIR locaux (docker-compose.yml de identite et dossier-fhir), `pnpm build`,
// les clés privées des comptes de service (<PREFIXE>_SERVICE_CLE_PRIVEE) dont Keycloak a reçu les certificats (scripts/cles-services-test.sh, ADR-0016), et un Unleash local
// (UNLEASH_ADMIN_TOKEN, UNLEASH_BACKEND_TOKEN), un LiveKit local (WEBRTC_API_KEY, WEBRTC_API_SECRET), et un
// PostgreSQL de test pour les invitations (INVITATIONS_DATABASE_URL, INVITATIONS_MIGRATION_DATABASE_URL,
// INVITATIONS_CLE_EMPREINTE) et les documents (DOCUMENTS_DATABASE_URL, DOCUMENTS_MIGRATION_DATABASE_URL,
// DOCUMENTS_CLE_MAITRE) et le paiement (PAIEMENT_DATABASE_URL, PAIEMENT_MIGRATION_DATABASE_URL,
// MOBILE_MONEY_WEBHOOK_SIGNING_SECRET), et un S3 de test (MBOLO_TEST_S3_*).
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
  COHORTE_TEST,
  DOCUMENTS_URL,
  INVITATIONS_URL,
  NOTIFICATIONS_URL,
  PAIEMENT_URL,
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
        // En CI, Keycloak (conteneur) crée le dossier à l'inscription par la passerelle.
        PASSERELLE_HOST: process.env['PASSERELLE_HOST'] ?? '127.0.0.1',
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
        IDENTITE_SERVICE_CLE_PRIVEE: process.env['IDENTITE_SERVICE_CLE_PRIVEE'] ?? '',
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
        TELECONSULTATION_SERVICE_CLE_PRIVEE:
          process.env['TELECONSULTATION_SERVICE_CLE_PRIVEE'] ?? '',
        NOTIFICATIONS_URL,
        PAIEMENT_URL,
        // Délai de paiement court (15 s) et passage fréquent : l'expiration se teste en e2e.
        TELECONSULTATION_DELAI_PAIEMENT_MINUTES: '0.25',
        TELECONSULTATION_EXPIRATION_INTERVALLE_MS: '2000',
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
        CONSULTATION_SERVICE_CLE_PRIVEE: process.env['CONSULTATION_SERVICE_CLE_PRIVEE'] ?? '',
        // Ordonnances électroniques (flag ordonnances.electroniques, ADR-0018).
        UNLEASH_API_URL: UNLEASH_URL,
        UNLEASH_BACKEND_TOKEN: process.env['UNLEASH_BACKEND_TOKEN'] ?? '',
        UNLEASH_REFRESH_MS: '500',
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
        NOTIFICATIONS_SERVICE_CLE_PRIVEE: process.env['NOTIFICATIONS_SERVICE_CLE_PRIVEE'] ?? '',
        PORT: new URL(NOTIFICATIONS_URL).port,
        MBOLO_ENV: 'dev',
      },
    },
    {
      command: 'node ../../services/invitations/dist/main.js',
      url: `${INVITATIONS_URL}/sante`,
      reuseExistingServer: false,
      env: {
        KEYCLOAK_ISSUER: EMETTEUR,
        INVITATIONS_DATABASE_URL: process.env['INVITATIONS_DATABASE_URL'] ?? '',
        INVITATIONS_MIGRATION_DATABASE_URL: process.env['INVITATIONS_MIGRATION_DATABASE_URL'] ?? '',
        INVITATIONS_CLE_EMPREINTE: process.env['INVITATIONS_CLE_EMPREINTE'] ?? '',
        INVITATIONS_COHORTES: COHORTE_TEST,
        // La base de test garde les codes des exécutions précédentes : quota large ici, testé à part.
        INVITATIONS_QUOTA_PAR_COHORTE: '1000000',
        // Invitations de proches (ADR-0019) : fiche dans le dossier, consentement, SMS du code.
        FHIR_BASE_URL: `${PASSERELLE_URL}/fhir`,
        IDENTITE_URL,
        NOTIFICATIONS_URL,
        INVITATIONS_SERVICE_CLE_PRIVEE: process.env['INVITATIONS_SERVICE_CLE_PRIVEE'] ?? '',
        UNLEASH_API_URL: UNLEASH_URL,
        UNLEASH_BACKEND_TOKEN: process.env['UNLEASH_BACKEND_TOKEN'] ?? '',
        UNLEASH_REFRESH_MS: '500',
        // Le patient de test invite des proches à chaque exécution : limite par jour large ici,
        // testée à part (tests unitaires et PostgreSQL).
        INVITATIONS_PROCHES_PAR_JOUR: '1000',
        // Compteurs d'essais gardés dans PostgreSQL (D3) : ils survivent d'une exécution à l'autre.
        // Limites larges ici pour pouvoir relancer la suite ; testées à part (unitaires et PostgreSQL).
        INVITATIONS_ESSAIS_MAX: '1000',
        INVITATIONS_ASSISTANCE_ESSAIS_MAX: '1000',
        // Système des numéros d'assurance des patients fictifs (preparation-globale.ts).
        INVITATIONS_SYSTEME_ASSURANCE:
          'https://mbolo-sante.example/fhir/identifiant-patient/assurance-maladie',
        // En CI, Keycloak (conteneur) appelle le service : écoute sur toutes les interfaces.
        INVITATIONS_HOST: process.env['INVITATIONS_HOST'] ?? '127.0.0.1',
        PORT: new URL(INVITATIONS_URL).port,
        MBOLO_ENV: 'dev',
      },
    },
    {
      command: 'node ../../services/documents/dist/main.js',
      url: `${DOCUMENTS_URL}/sante`,
      reuseExistingServer: false,
      env: {
        KEYCLOAK_ISSUER: EMETTEUR,
        FHIR_BASE_URL: `${PASSERELLE_URL}/fhir`,
        DOCUMENTS_SERVICE_CLE_PRIVEE: process.env['DOCUMENTS_SERVICE_CLE_PRIVEE'] ?? '',
        DOCUMENTS_DATABASE_URL: process.env['DOCUMENTS_DATABASE_URL'] ?? '',
        DOCUMENTS_MIGRATION_DATABASE_URL: process.env['DOCUMENTS_MIGRATION_DATABASE_URL'] ?? '',
        DOCUMENTS_CLE_MAITRE: process.env['DOCUMENTS_CLE_MAITRE'] ?? '',
        // S3 de test (scripts/s3-test.sh) ; compartiment créé au démarrage hors production.
        STORAGE_ENDPOINT: process.env['MBOLO_TEST_S3_URL'] ?? '',
        STORAGE_ACCESS_KEY_ID: process.env['MBOLO_TEST_S3_CLE'] ?? '',
        STORAGE_SECRET_ACCESS_KEY: process.env['MBOLO_TEST_S3_SECRET'] ?? '',
        STORAGE_BUCKET: 'mbolo-e2e-documents',
        // Tous les envois viennent de la même adresse en e2e ; la limite est testée à part (unitaire).
        DOCUMENTS_LIMITE_DEPOT_PAR_MINUTE: '100',
        UNLEASH_API_URL: UNLEASH_URL,
        UNLEASH_BACKEND_TOKEN: process.env['UNLEASH_BACKEND_TOKEN'] ?? '',
        UNLEASH_REFRESH_MS: '500',
        PORT: new URL(DOCUMENTS_URL).port,
        MBOLO_ENV: 'dev',
      },
    },
    {
      // Application patient construite par `pnpm build`, servie avec le relais vers les API.
      command: 'pnpm exec vite preview',
      cwd: '../../apps/patient',
      url: APP_PATIENT_URL,
      reuseExistingServer: false,
      env: {
        TELECONSULTATION_URL,
        CONSULTATION_URL,
        IDENTITE_URL,
        DOCUMENTS_URL,
        INVITATIONS_URL,
        PAIEMENT_URL,
      },
    },
    {
      command: 'node ../../services/paiement/dist/main.js',
      url: `${PAIEMENT_URL}/sante`,
      reuseExistingServer: false,
      env: {
        KEYCLOAK_ISSUER: EMETTEUR,
        PAIEMENT_DATABASE_URL: process.env['PAIEMENT_DATABASE_URL'] ?? '',
        PAIEMENT_MIGRATION_DATABASE_URL: process.env['PAIEMENT_MIGRATION_DATABASE_URL'] ?? '',
        MOBILE_MONEY_WEBHOOK_SIGNING_SECRET:
          process.env['MOBILE_MONEY_WEBHOOK_SIGNING_SECRET'] ?? '',
        // [FICTIF] Grille du pays de test (le tableur du business plan fait foi).
        PAIEMENT_DEVISE: 'XAF',
        PAIEMENT_PRIX: '{"generaliste":10000,"specialiste":15000}',
        PAIEMENT_OPERATEURS: 'airtel,moov',
        PAIEMENT_INDICATIF: '241',
        // Le payeur simulé valide ou refuse (développement et e2e seulement).
        PAIEMENT_SIMULATION: 'true',
        // Rapprochement fréquent en e2e (15 min par défaut).
        PAIEMENT_RAPPROCHEMENT_INTERVALLE_MS: '2000',
        // Tous les paiements viennent de la même adresse en e2e ; la limite est testée à part (unitaire).
        PAIEMENT_COLLECTE_PAR_MINUTE: '100',
        UNLEASH_API_URL: UNLEASH_URL,
        UNLEASH_BACKEND_TOKEN: process.env['UNLEASH_BACKEND_TOKEN'] ?? '',
        UNLEASH_REFRESH_MS: '500',
        PORT: new URL(PAIEMENT_URL).port,
        MBOLO_ENV: 'dev',
      },
    },
    {
      command: 'pnpm exec vite preview',
      cwd: '../../apps/professionnel',
      url: APP_PRO_URL,
      reuseExistingServer: false,
      env: { TELECONSULTATION_URL, CONSULTATION_URL, DOCUMENTS_URL, PAIEMENT_URL, INVITATIONS_URL },
    },
  ],
});
