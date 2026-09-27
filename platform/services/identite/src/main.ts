// Démarrage du service identité. Configuration par variables d'environnement (aucun secret requis en
// vague 0 : l'API vérifie des jetons publics signés par Keycloak ; le serveur FHIR local est sans
// authentification et ne contient que des données fictives).
import { creerJournal } from '@mbolo/journal-securise';
import { DepotMemoire, ServiceConsentements, type DepotConsentements } from './consentements.js';
import { DepotFhir } from './depot-fhir.js';
import { creerVerificateur } from './jeton.js';
import { creerServeur } from './serveur.js';

const emetteur = process.env['KEYCLOAK_ISSUER'];
const audience = process.env['IDENTITE_AUDIENCE'] ?? 'mbolo-identite-api';
const port = Number(process.env['PORT'] ?? '3001');
const env = process.env['MBOLO_ENV'] === 'prod' ? 'prod' : 'dev';
const fhir = process.env['FHIR_BASE_URL'];

const journal = creerJournal({ service: 'identite' });

if (!emetteur) {
  journal.erreur('KEYCLOAK_ISSUER manquant : arrêt.');
  process.exit(1);
}
if (env === 'prod') {
  // Vague 0 : l'accès authentifié (SMART on FHIR) au dossier de production n'est pas encore en place.
  journal.erreur('Authentification du dossier médical de production non configurée : arrêt.');
  process.exit(1);
}

let depot: DepotConsentements;
if (fhir) {
  depot = new DepotFhir({ base: fhir });
  journal.info('consentements enregistrés dans le dossier FHIR');
} else {
  depot = new DepotMemoire();
  journal.avertissement('FHIR_BASE_URL absent : consentements en mémoire (perdus à l’arrêt).');
}
const app = creerServeur({
  verifierJeton: creerVerificateur({ emetteur, audience }),
  consentements: new ServiceConsentements(depot, env),
  depot,
  journal,
});

await app.listen({ host: '127.0.0.1', port });
journal.info('service identité démarré', { port });
