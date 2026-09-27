// Démarrage du service identité. Configuration par variables d'environnement (aucun secret requis :
// l'API ne fait que vérifier des jetons publics signés par Keycloak).
import { creerJournal } from '@mbolo/journal-securise';
import { DepotMemoire, ServiceConsentements } from './consentements.js';
import { creerVerificateur } from './jeton.js';
import { creerServeur } from './serveur.js';

const emetteur = process.env['KEYCLOAK_ISSUER'];
const audience = process.env['IDENTITE_AUDIENCE'] ?? 'mbolo-identite-api';
const port = Number(process.env['PORT'] ?? '3001');
const env = process.env['MBOLO_ENV'] === 'prod' ? 'prod' : 'dev';

const journal = creerJournal({ service: 'identite' });

if (!emetteur) {
  journal.erreur('KEYCLOAK_ISSUER manquant : arrêt.');
  process.exit(1);
}
if (env === 'prod') {
  // Le dépôt en mémoire n'est pas destiné à la production (vague 0).
  journal.erreur('Dépôt de production non configuré : arrêt.');
  process.exit(1);
}

const depot = new DepotMemoire();
const app = creerServeur({
  verifierJeton: creerVerificateur({ emetteur, audience }),
  consentements: new ServiceConsentements(depot, env),
  depot,
  journal,
});

await app.listen({ host: '127.0.0.1', port });
journal.info('service identité démarré', { port });
