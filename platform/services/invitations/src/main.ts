// Démarrage du service des invitations (ADR-0013). Adresses de base et clé d'empreinte depuis le
// coffre-fort, jamais le dépôt. Cohortes, quota et durée : paramètres du déploiement (pays, vague).
import { readdirSync, readFileSync } from 'node:fs';
import { connecter, migrer, roleDe } from '@mbolo/base-donnees';
import { creerVerificateur } from '@mbolo/identite';
import { creerJournal } from '@mbolo/journal-securise';
import { creerEmpreinte } from './codes.js';
import { DepotPostgres } from './depot.js';
import { Limiteur } from './limiteur.js';
import { creerServeur } from './serveur.js';
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

let service: ServiceInvitations;
try {
  service = new ServiceInvitations(
    new DepotPostgres(connecter({ url: urlBase, application: 'invitations', production })),
    creerEmpreinte(cle),
    {
      cohortes,
      quotaParCohorte: Number(env['INVITATIONS_QUOTA_PAR_COHORTE'] ?? '100'),
      validiteJours: Number(env['INVITATIONS_VALIDITE_JOURS'] ?? '14'),
    },
  );
} catch (e) {
  journal.erreur('paramètres des invitations invalides', { err: e });
  process.exit(1);
}

const app = creerServeur({
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
  trustProxy: env['INVITATIONS_TRUST_PROXY'] === 'true',
});
const port = Number(env['PORT'] ?? '3006');
await app.listen({ host: '127.0.0.1', port });
journal.info('service des invitations démarré', { port, cohortes });
