// Démarrage du service de paiement (ADR-0017). Adresses de base et secret de signature depuis le
// coffre-fort, jamais le dépôt. Devise, prix, opérateurs et indicatif : paramètres du pays déployé.
import { readdirSync, readFileSync } from 'node:fs';
import { connecter, migrer, roleDe } from '@mbolo/base-donnees';
import { drapeauxFixes, drapeauxUnleash } from '@mbolo/drapeaux';
import { creerVerificateur } from '@mbolo/identite';
import { creerJournal, signalerAlerte } from '@mbolo/journal-securise';
import { DepotPostgres } from './depot.js';
import { FournisseurSimule } from './fournisseur.js';
import { creerVerificateurAppelant } from './jeton.js';
import { LIMITES_PAR_DEFAUT, creerServeur } from './serveur.js';
import { ServicePaiement } from './service.js';
import { tarifsDepuis, type Tarifs } from './tarifs.js';

const journal = creerJournal({ service: 'paiement' });
const env = process.env;
const production = env['MBOLO_ENV'] === 'prod';
const emetteur = env['KEYCLOAK_ISSUER'];
const urlBase = env['PAIEMENT_DATABASE_URL'];
const secretSignature = env['MOBILE_MONEY_WEBHOOK_SIGNING_SECRET'];

if (!emetteur || !urlBase || !secretSignature) {
  journal.erreur(
    'KEYCLOAK_ISSUER, PAIEMENT_DATABASE_URL et MOBILE_MONEY_WEBHOOK_SIGNING_SECRET sont obligatoires.',
  );
  process.exit(1);
}
if (production) {
  // Prestataire non choisi (ADR-0017) : seul le fournisseur simulé existe.
  journal.erreur('Fournisseur simulé : le service ne démarre pas en production.');
  process.exit(1);
}

let tarifs: Tarifs;
try {
  tarifs = tarifsDepuis(env);
} catch (e) {
  journal.erreur('grille de prix invalide', { err: e });
  process.exit(1);
}

// Migrations avec le rôle propriétaire du schéma (adresse distincte), jamais avec le rôle d'exécution.
const urlMigration = env['PAIEMENT_MIGRATION_DATABASE_URL'];
if (urlMigration) {
  const proprietaire = connecter({
    url: urlMigration,
    application: 'paiement-migrations',
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
      schema: 'paiement',
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

const drapeaux =
  env['UNLEASH_API_URL'] && env['UNLEASH_BACKEND_TOKEN']
    ? await drapeauxUnleash({
        url: env['UNLEASH_API_URL'],
        jeton: env['UNLEASH_BACKEND_TOKEN'],
        application: 'paiement',
        rafraichissementMs: Number(env['UNLEASH_REFRESH_MS'] ?? '15000'),
      })
    : await drapeauxFixes();

const fournisseur = new FournisseurSimule(secretSignature);
const audience = env['PAIEMENT_AUDIENCE'] ?? 'mbolo-paiement-api';
const service = new ServicePaiement(
  new DepotPostgres(connecter({ url: urlBase, application: 'paiement', production })),
  fournisseur,
  tarifs,
  drapeaux,
  () => new Date(),
  // Les valideurs sont prévenus (alerte remboursement-a-valider, ADR-0016) ; jamais le patient.
  (r) =>
    signalerAlerte(journal, 'remboursement-a-valider', 'remboursement à valider', {
      remboursementId: r.id,
      montant: r.montant,
      devise: r.devise,
    }),
);

// Rapprochement avec le prestataire : collectes en attente relues, remboursements préparés pour les
// rendez-vous annulés mais payés, remboursements validés exécutés. Un passage à la fois.
let enCours = false;
setInterval(
  () => {
    if (enCours) return;
    enCours = true;
    service
      .rapprocher()
      .then((bilan) => {
        if (bilan.relues || bilan.prepares || bilan.effectues || bilan.erreurs) {
          journal.info('rapprochement des paiements', { ...bilan });
        }
      })
      .catch((e: unknown) => journal.avertissement('rapprochement impossible', { err: e }))
      .finally(() => {
        enCours = false;
      });
  },
  Number(env['PAIEMENT_RAPPROCHEMENT_INTERVALLE_MS'] ?? '900000'),
).unref();

const app = await creerServeur({
  verifierJeton: creerVerificateur({ emetteur, audience }),
  verifierAppelant: creerVerificateurAppelant({
    emetteur,
    audience,
    clientsAutorises: (env['PAIEMENT_CLIENTS_AUTORISES'] ?? 'mbolo-teleconsultation-service')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  }),
  service,
  // Développement et e2e : le payeur simulé valide ou refuse (jamais en production, refusée plus haut).
  ...(env['PAIEMENT_SIMULATION'] === 'true' ? { simulation: fournisseur } : {}),
  journal,
  limites: {
    parMinute: Number(env['PAIEMENT_LIMITE_PAR_MINUTE'] ?? LIMITES_PAR_DEFAUT.parMinute),
    collecteParMinute: Number(
      env['PAIEMENT_COLLECTE_PAR_MINUTE'] ?? LIMITES_PAR_DEFAUT.collecteParMinute,
    ),
  },
  trustProxy: env['PAIEMENT_TRUST_PROXY'] === 'true',
});
const port = Number(env['PORT'] ?? '3008');
await app.listen({ host: '127.0.0.1', port });
journal.info('service de paiement démarré (fournisseur simulé)', {
  port,
  devise: tarifs.devise,
  operateurs: tarifs.operateurs,
});
