// Démarrage du service de notifications (ADR-0012). Secret du compte de service
// (NOTIFICATIONS_SERVICE_CLIENT_SECRET) depuis le coffre-fort, jamais le dépôt.
import { creerFournisseurJeton } from '@mbolo/identite';
import { creerJournal } from '@mbolo/journal-securise';
import { PAYS_PAR_DEFAUT, verifierPays, type Pays } from './gabarits.js';
import { ContactsFhir } from './dossier.js';
import { creerVerificateurAppelant } from './jeton.js';
import { CanalSimule, ServiceNotifications } from './notifications.js';
import { creerServeur } from './serveur.js';

const journal = creerJournal({ service: 'notifications' });
const env = process.env;
const emetteur = env['KEYCLOAK_ISSUER'];
const fhir = env['FHIR_BASE_URL'];
const secret = env['NOTIFICATIONS_SERVICE_CLIENT_SECRET'];

if (!emetteur || !fhir || !secret) {
  journal.erreur(
    'KEYCLOAK_ISSUER, FHIR_BASE_URL et NOTIFICATIONS_SERVICE_CLIENT_SECRET sont obligatoires.',
  );
  process.exit(1);
}
if (env['MBOLO_ENV'] === 'prod') {
  // Fournisseur SMS / WhatsApp non choisi : seul le canal simulé existe (ADR-0012).
  journal.erreur('Canal simulé : le service ne démarre pas en production.');
  process.exit(1);
}

// Pays déployé (le Gabon par défaut) : fuseau et langue des messages.
const pays: Pays = {
  fuseau: env['NOTIFICATIONS_FUSEAU'] ?? PAYS_PAR_DEFAUT.fuseau,
  langue: env['NOTIFICATIONS_LANGUE'] ?? PAYS_PAR_DEFAUT.langue,
};
try {
  verifierPays(pays);
} catch (e) {
  journal.erreur('pays de déploiement invalide', { err: e });
  process.exit(1);
}

const entetes = creerFournisseurJeton({
  emetteur,
  client: env['NOTIFICATIONS_SERVICE_CLIENT_ID'] ?? 'mbolo-notifications-service',
  secret,
});
const canal = new CanalSimule();
const app = creerServeur({
  verifierAppelant: creerVerificateurAppelant({
    emetteur,
    audience: env['NOTIFICATIONS_AUDIENCE'] ?? 'mbolo-notifications',
    clientsAutorises: (env['NOTIFICATIONS_CLIENTS_AUTORISES'] ?? 'mbolo-teleconsultation-service')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  }),
  service: new ServiceNotifications(new ContactsFhir({ base: fhir, entetes }), canal, pays),
  journal,
  simulation: canal,
});
const port = Number(env['PORT'] ?? '3004');
await app.listen({ host: '127.0.0.1', port });
journal.info('service de notifications démarré (canal simulé)', { port, ...pays });
