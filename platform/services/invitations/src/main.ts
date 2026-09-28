// Démarrage du service des invitations (ADR-0013). Adresses de base et clé d'empreinte depuis le
// coffre-fort, jamais le dépôt. Cohortes, quota et durée : paramètres du déploiement (pays, vague).
import { readdirSync, readFileSync } from 'node:fs';
import { connecter, migrer, roleDe } from '@mbolo/base-donnees';
import { drapeauxFixes, drapeauxUnleash } from '@mbolo/drapeaux';
import { authentificationDepuis, creerFournisseurJeton, creerVerificateur } from '@mbolo/identite';
import { ConsentementsIdentite, DossierProchesFhir, SmsNotifications } from './adaptateurs.js';
import { creerJournal } from '@mbolo/journal-securise';
import { creerEmpreinte } from './codes.js';
import { creerVerificateurService } from './jeton-service.js';
import { DepotPostgres } from './depot.js';
import { Limiteur } from './limiteur.js';
import { creerServeur } from './serveur.js';
import { ServiceProches } from './proches.js';
import { ServiceInvitations } from './service.js';

const journal = creerJournal({ service: 'invitations' });
const env = process.env;
const production = env['MBOLO_ENV'] === 'prod';
const emetteur = env['KEYCLOAK_ISSUER'];
const urlBase = env['INVITATIONS_DATABASE_URL'];
const cle = env['INVITATIONS_CLE_EMPREINTE'];
const cohortes = (env['INVITATIONS_COHORTES'] ?? '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

if (!emetteur || !urlBase || !cle || cohortes.length === 0) {
  journal.erreur(
    'KEYCLOAK_ISSUER, INVITATIONS_DATABASE_URL, INVITATIONS_CLE_EMPREINTE et INVITATIONS_COHORTES sont obligatoires.',
  );
  process.exit(1);
}

// Migrations avec le rôle propriétaire du schéma (adresse distincte), jamais avec le rôle d'exécution.
const urlMigration = env['INVITATIONS_MIGRATION_DATABASE_URL'];
if (urlMigration) {
  const proprietaire = connecter({
    url: urlMigration,
    application: 'invitations-migrations',
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
      schema: 'invitations',
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

// Invitations de proches (ADR-0019) : seulement si le dossier, identite, les notifications et le
// compte de service sont configurés ; sinon les routes /proches sont absentes et les codes de
// proches sont refusés à l'inscription.
const fhir = env['FHIR_BASE_URL'];
const identite = env['IDENTITE_URL'];
const notifications = env['NOTIFICATIONS_URL'];
const authentification = authentificationDepuis(env, 'INVITATIONS');
const depot = new DepotPostgres(
  connecter({ url: urlBase, application: 'invitations', production }),
);
const empreinte = creerEmpreinte(cle);
let proches: ServiceProches | undefined;
let service: ServiceInvitations;
try {
  if (fhir && identite && notifications && authentification) {
    const entetes = creerFournisseurJeton({
      emetteur,
      client: env['INVITATIONS_SERVICE_CLIENT_ID'] ?? 'mbolo-invitations-service',
      authentification,
    });
    const drapeaux =
      env['UNLEASH_API_URL'] && env['UNLEASH_BACKEND_TOKEN']
        ? await drapeauxUnleash({
            url: env['UNLEASH_API_URL'],
            jeton: env['UNLEASH_BACKEND_TOKEN'],
            application: 'invitations',
            rafraichissementMs: Number(env['UNLEASH_REFRESH_MS'] ?? '15000'),
          })
        : await drapeauxFixes();
    proches = new ServiceProches(
      depot,
      empreinte,
      new DossierProchesFhir({ base: fhir, entetes }),
      new ConsentementsIdentite(identite),
      new SmsNotifications(notifications, entetes),
      drapeaux,
      {
        max: Number(env['INVITATIONS_PROCHES_MAX'] ?? '3'),
        validiteJours: Number(env['INVITATIONS_VALIDITE_PROCHE_JOURS'] ?? '7'),
        env: production ? 'prod' : 'dev',
      },
    );
  }
  const activer = proches;
  service = new ServiceInvitations(
    depot,
    empreinte,
    {
      cohortes,
      quotaParCohorte: Number(env['INVITATIONS_QUOTA_PAR_COHORTE'] ?? '100'),
      validiteJours: Number(env['INVITATIONS_VALIDITE_JOURS'] ?? '14'),
    },
    undefined,
    activer ? (i) => activer.activer(i) : undefined,
  );
} catch (e) {
  journal.erreur('paramètres des invitations invalides', { err: e });
  process.exit(1);
}

const app = await creerServeur({
  limiteParMinute: Number(env['INVITATIONS_LIMITE_PAR_MINUTE'] ?? '300'),
  verifierJeton: creerVerificateur({
    emetteur,
    audience: env['INVITATIONS_AUDIENCE'] ?? 'mbolo-invitations-api',
  }),
  service,
  limiteur: new Limiteur(
    Number(env['INVITATIONS_ESSAIS_MAX'] ?? '10'),
    Number(env['INVITATIONS_ESSAIS_FENETRE_MINUTES'] ?? '15') * 60_000,
  ),
  journal,
  ...(proches ? { proches } : {}),
  trustProxy: env['INVITATIONS_TRUST_PROXY'] === 'true',
  // Extension d'inscription de Keycloak (ADR-0014) : jetons signés par le royaume lui-même.
  verifierService: creerVerificateurService({
    emetteur,
    audience: env['INVITATIONS_AUDIENCE'] ?? 'mbolo-invitations-api',
    clientsAutorises: ['mbolo-keycloak-inscription'],
  }),
});
const port = Number(env['PORT'] ?? '3006');
// Par défaut, seulement la machine locale ; `INVITATIONS_HOST` permet à un Keycloak en conteneur de
// joindre le service (CI).
await app.listen({ host: env['INVITATIONS_HOST'] ?? '127.0.0.1', port });
journal.info('service des invitations démarré', { port, cohortes, proches: !!proches });
