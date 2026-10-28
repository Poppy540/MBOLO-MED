// Démarrage du service documents (prototype, ADR-0015). Secrets depuis le coffre-fort, jamais le
// dépôt : clé maître (DOCUMENTS_CLE_MAITRE), clés du stockage (STORAGE_*), adresses de base et secret
// clé privée du compte de service (DOCUMENTS_SERVICE_CLE_PRIVEE, ADR-0016).
import { readdirSync, readFileSync } from 'node:fs';
import { connecter, migrer, roleDe } from '@mbolo/base-donnees';
import { drapeauxFixes, drapeauxUnleash } from '@mbolo/drapeaux';
import {
  authentificationDepuis,
  creerFournisseurJeton,
  creerVerificateur,
  creerVerificateurAppelant,
  exigerHttps,
} from '@mbolo/identite';
import { creerJournal } from '@mbolo/journal-securise';
import { AlerteNumeroHttp } from './alerte.js';
import { DepotCandidaturesPostgres, ServiceCandidature } from './candidature.js';
import { trousseauDepuis } from './cles.js';
import { ConditionsFhir } from './conditions.js';
import { DepotPostgres } from './depot.js';
import { DossierFhir, FichesFhir } from './dossier.js';
import { RecruteursHttp } from './recruteurs.js';
import { DepotDecisionsProPostgres, ServiceVerificationPro } from './verification-pro.js';
import { SPECIALITES } from '@mbolo/dossier-fhir';
import { ServicePerte } from './perte.js';
import { creerServeur, LIMITES_PAR_DEFAUT } from './serveur.js';
import { ServiceDocuments } from './service.js';
import { StockageS3 } from './stockage.js';
import { ServiceVerification } from './verification.js';
import { ServiceVerificateur } from './verificateur.js';

const journal = creerJournal({ service: 'documents' });
const env = process.env;
const production = env['MBOLO_ENV'] === 'prod';

if (production) {
  // Prototype : charte à valider par le juriste, durée de conservation et hébergement en attente.
  journal.erreur('Prototype : le service ne démarre pas en production.');
  process.exit(1);
}

const obligatoires = [
  'KEYCLOAK_ISSUER',
  'FHIR_BASE_URL',
  'DOCUMENTS_DATABASE_URL',
  'STORAGE_ENDPOINT',
  'STORAGE_BUCKET',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
] as const;
const authService = authentificationDepuis(env, 'DOCUMENTS');
const manquantes = obligatoires.filter((n) => !env[n]);
if (manquantes.length > 0 || !authService) {
  journal.erreur('configuration incomplète', {
    manquantes: [...manquantes, ...(authService ? [] : ['DOCUMENTS_SERVICE_CLE_PRIVEE'])],
  });
  process.exit(1);
}
const lire = (n: (typeof obligatoires)[number]): string => env[n] ?? '';
const urlBase = lire('DOCUMENTS_DATABASE_URL');

// Migrations avec le rôle propriétaire du schéma (adresse distincte), jamais avec le rôle d'exécution.
const urlMigration = env['DOCUMENTS_MIGRATION_DATABASE_URL'];
if (urlMigration) {
  const proprietaire = connecter({
    url: urlMigration,
    application: 'documents-migrations',
    production,
    max: 1,
  });
  try {
    const dossier = new URL('../migrations/', import.meta.url);
    const migrations = readdirSync(dossier)
      .filter((f) => f.endsWith('.sql'))
      .map((nom) => ({ nom, sql: readFileSync(new URL(nom, dossier), 'utf8') }));
    const appliquees = await migrer({
      sql: proprietaire,
      schema: 'documents',
      roleExecution: roleDe(urlBase),
      migrations,
    });
    journal.info('migrations appliquées', { appliquees });
  } catch (e) {
    journal.erreur('migrations impossibles', { err: e });
    process.exit(1);
  } finally {
    await proprietaire.end();
  }
}

const stockage = new StockageS3({
  url: lire('STORAGE_ENDPOINT'),
  region: env['STORAGE_REGION'] ?? 'us-east-1',
  compartiment: lire('STORAGE_BUCKET'),
  cleAcces: lire('STORAGE_ACCESS_KEY_ID'),
  secret: lire('STORAGE_SECRET_ACCESS_KEY'),
});
// Hors production seulement (le service refuse de démarrer en production, voir plus haut).
try {
  await stockage.creerCompartimentSiAbsent();
} catch (e) {
  journal.erreur('stockage objet injoignable', { err: e });
  process.exit(1);
}

const sql = connecter({ url: urlBase, application: 'documents', production });
const depot = new DepotPostgres(sql);
// KMS de l'hébergeur si configuré, sinon clé locale du coffre-fort (ADR-0016).
const maitre = trousseauDepuis(env);
let documents: ServiceDocuments;
try {
  documents = new ServiceDocuments(depot, stockage, maitre, {
    // Durée à fixer par pays avec l'avis juridique (ADR-0015).
    conservationJours: Number(env['DOCUMENTS_CONSERVATION_JOURS'] ?? '90'),
    maxParType: Number(env['DOCUMENTS_MAX_PAR_TYPE'] ?? '2'),
  });
} catch (e) {
  journal.erreur('paramètres des documents invalides', { err: e });
  process.exit(1);
}

const emetteur = lire('KEYCLOAK_ISSUER');
const drapeaux =
  env['UNLEASH_API_URL'] && env['UNLEASH_BACKEND_TOKEN']
    ? await drapeauxUnleash({
        url: env['UNLEASH_API_URL'],
        jeton: env['UNLEASH_BACKEND_TOKEN'],
        application: 'documents',
        rafraichissementMs: Number(env['UNLEASH_REFRESH_MS'] ?? '15000'),
      })
    : await drapeauxFixes();

const acces = {
  base: lire('FHIR_BASE_URL'),
  entetes: creerFournisseurJeton({
    emetteur,
    client: env['DOCUMENTS_SERVICE_CLIENT_ID'] ?? 'mbolo-documents-service',
    authentification: authService,
  }),
};
const conditions = new ConditionsFhir(acces);
// Système (URI) des numéros : dépend du pays déployé (Gabon : CNAMGS) [FICTIF par défaut en dev].
const systemes = {
  'assurance-maladie':
    env['DOCUMENTS_SYSTEME_ASSURANCE'] ??
    'https://mbolo-sante.example/fhir/identifiant/ga/assurance-maladie',
  provisoire:
    env['DOCUMENTS_SYSTEME_PROVISOIRE'] ??
    'https://mbolo-sante.example/fhir/identifiant/ga/provisoire',
};

// Revue ASVS n°1 (C2) : en production, uniquement des adresses chiffrées (HTTPS, WSS).
try {
  exigerHttps(
    {
      KEYCLOAK_ISSUER: env['KEYCLOAK_ISSUER'],
      FHIR_BASE_URL: env['FHIR_BASE_URL'],
      STORAGE_ENDPOINT: env['STORAGE_ENDPOINT'],
      UNLEASH_API_URL: env['UNLEASH_API_URL'],
      NOTIFICATIONS_URL: env['NOTIFICATIONS_URL'],
      INVITATIONS_URL: env['INVITATIONS_URL'],
    },
    env['MBOLO_ENV'] === 'prod',
  );
} catch (e) {
  journal.erreur('adresses non chiffrées refusées en production', { err: e });
  process.exit(1);
}

const dossier = new DossierFhir(acces);
// Dossier de candidature des professionnels (ADR-0026) : même chiffrement, même stockage.
let candidature: ServiceCandidature;
try {
  candidature = new ServiceCandidature(
    new DepotCandidaturesPostgres(sql),
    stockage,
    maitre,
    new FichesFhir(acces),
    {
      versionCharte: env['DOCUMENTS_VERSION_CHARTE_PRO'] ?? 'c-verification-pro-v0.1',
      // Durée à fixer avec le juriste (ADR-0026, question 5) ; 2 ans en attendant.
      conservationJours: Number(env['DOCUMENTS_PIECES_CONSERVATION_JOURS'] ?? '730'),
      maxParType: Number(env['DOCUMENTS_PIECES_MAX_PAR_TYPE'] ?? '2'),
      // Listes fermées par pays : spécialités ouvertes (liste du comité médical) et langues proposées.
      specialites: (env['DOCUMENTS_SPECIALITES'] ?? Object.keys(SPECIALITES).join(',')).split(','),
      langues: (env['DOCUMENTS_LANGUES_CONSULTATION'] ?? 'fr,en,es,pt,fan,puu,mye,nzb').split(','),
    },
  );
} catch (e) {
  journal.erreur('paramètres des pièces des professionnels invalides', { err: e });
  process.exit(1);
}
const verificateur = new ServiceVerificateur(documents, depot, dossier, { systemes, env: 'dev' });
// Vérification des professionnels (ADR-0026) : seulement si le service invitations répond à
// « qui a recruté cette fiche ? » (séparation des tâches) ; sinon, aucune vérification possible.
const invitations = env['INVITATIONS_URL'];
const verificationPro = invitations
  ? new ServiceVerificationPro(
      new DepotDecisionsProPostgres(sql),
      new DepotCandidaturesPostgres(sql),
      stockage,
      maitre,
      new FichesFhir(acces),
      new RecruteursHttp(invitations, acces.entetes),
      env['MBOLO_ENV'] === 'prod' ? 'prod' : 'dev',
    )
  : undefined;
if (!verificationPro) {
  journal.avertissement('INVITATIONS_URL absente : vérification des professionnels désactivée');
}
// Téléphone perdu (ADR-0023) : seulement si le service notifications est joignable (alerte à
// l'ancien numéro avant tout changement).
const notifications = env['NOTIFICATIONS_URL'];
const perte = notifications
  ? {
      service: new ServicePerte(
        documents,
        depot,
        dossier,
        verificateur,
        new AlerteNumeroHttp(notifications, acces.entetes),
        maitre,
      ),
      verifierAppelant: creerVerificateurAppelant({
        emetteur,
        audience: env['DOCUMENTS_AUDIENCE'] ?? 'mbolo-documents-api',
        clientsAutorises: (env['DOCUMENTS_APPELANTS_PERTE'] ?? 'mbolo-keycloak-inscription')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      }),
    }
  : undefined;
if (!perte) journal.avertissement('NOTIFICATIONS_URL absente : demandes « perte » désactivées');

const app = await creerServeur({
  verifierJeton: creerVerificateur({
    emetteur,
    audience: env['DOCUMENTS_AUDIENCE'] ?? 'mbolo-documents-api',
  }),
  verification: new ServiceVerification(
    documents,
    conditions,
    drapeaux,
    env['DOCUMENTS_VERSION_CHARTE'] ?? '0.1',
    depot,
  ),
  verificateur,
  candidature,
  ...(verificationPro ? { verificationPro } : {}),
  ...(perte ? { perte } : {}),
  journal,
  limites: {
    parMinute: Number(env['DOCUMENTS_LIMITE_PAR_MINUTE'] ?? LIMITES_PAR_DEFAUT.parMinute),
    depotParMinute: Number(
      env['DOCUMENTS_LIMITE_DEPOT_PAR_MINUTE'] ?? LIMITES_PAR_DEFAUT.depotParMinute,
    ),
  },
  trustProxy: env['DOCUMENTS_TRUST_PROXY'] === 'true',
});

// Suppression automatique à échéance (clé détruite, puis objet), toutes les heures.
const purger = async (): Promise<void> => {
  try {
    const n = await documents.supprimerEchus();
    if (n > 0) journal.info('documents échus supprimés', { nombre: n });
    const p = await candidature.supprimerEchus();
    if (p > 0) journal.info('pièces de professionnels échues supprimées', { nombre: p });
  } catch (e) {
    journal.erreur('suppression des documents échus impossible', { err: e });
  }
};
await purger();
setInterval(() => void purger(), 3_600_000).unref();

const port = Number(env['PORT'] ?? '3007');
// Par défaut, seulement la machine locale ; `DOCUMENTS_HOST` permet à un Keycloak en conteneur de
// joindre le service (CI : demande « téléphone perdu », ADR-0023).
await app.listen({ host: env['DOCUMENTS_HOST'] ?? '127.0.0.1', port });
journal.info('service documents démarré', { port });
