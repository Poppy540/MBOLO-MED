// Démarrage du service identité. Configuration par variables d'environnement. Le seul secret est
// celui du compte de service (IDENTITE_SERVICE_CLIENT_SECRET) qui donne accès au dossier via la
// passerelle : il vient du coffre-fort, jamais du dépôt.
import { drapeauxFixes, drapeauxUnleash } from '@mbolo/drapeaux';
import { creerJournal } from '@mbolo/journal-securise';
import { DepotMemoire, ServiceConsentements, type DepotConsentements } from './consentements.js';
import { DepotFhir } from './depot-fhir.js';
import { creerFournisseurJeton } from './jeton-service.js';
import { creerVerificateur } from './jeton.js';
import { creerServeur } from './serveur.js';

const emetteur = process.env['KEYCLOAK_ISSUER'];
const audience = process.env['IDENTITE_AUDIENCE'] ?? 'mbolo-identite-api';
const port = Number(process.env['PORT'] ?? '3001');
const env = process.env['MBOLO_ENV'] === 'prod' ? 'prod' : 'dev';
const fhir = process.env['FHIR_BASE_URL'];
const clientService = process.env['IDENTITE_SERVICE_CLIENT_ID'] ?? 'mbolo-identite-service';
const secretService = process.env['IDENTITE_SERVICE_CLIENT_SECRET'];
const unleashUrl = process.env['UNLEASH_API_URL'];
const unleashJeton = process.env['UNLEASH_BACKEND_TOKEN'];

const journal = creerJournal({ service: 'identite' });

if (!emetteur) {
  journal.erreur('KEYCLOAK_ISSUER manquant : arrêt.');
  process.exit(1);
}
if (env === 'prod') {
  // Vague 0 : pas de mise en production (hébergement HDS, revue de sécurité et avis juridique en attente).
  journal.erreur('Vague 0 : le service ne démarre pas en production.');
  process.exit(1);
}

let depot: DepotConsentements;
if (fhir) {
  if (!secretService) {
    journal.erreur('IDENTITE_SERVICE_CLIENT_SECRET manquant : accès au dossier impossible, arrêt.');
    process.exit(1);
  }
  depot = new DepotFhir({
    base: fhir,
    entetes: creerFournisseurJeton({ emetteur, client: clientService, secret: secretService }),
  });
  journal.info('consentements enregistrés dans le dossier FHIR (passerelle authentifiée)');
} else {
  depot = new DepotMemoire();
  journal.avertissement('FHIR_BASE_URL absent : consentements en mémoire (perdus à l’arrêt).');
}
// Feature flags (ADR-0007) : sans Unleash, toutes les fonctions nouvelles restent désactivées.
let drapeaux;
if (unleashUrl && unleashJeton) {
  drapeaux = await drapeauxUnleash({
    url: unleashUrl,
    jeton: unleashJeton,
    application: 'identite',
    rafraichissementMs: Number(process.env['UNLEASH_REFRESH_MS'] ?? '15000'),
  });
  journal.info('feature flags servis par Unleash');
} else {
  drapeaux = await drapeauxFixes();
  journal.avertissement('Unleash non configuré : toutes les fonctions nouvelles sont désactivées.');
}

const app = creerServeur({
  verifierJeton: creerVerificateur({ emetteur, audience }),
  consentements: new ServiceConsentements(depot, env, drapeaux),
  depot,
  journal,
});

await app.listen({ host: '127.0.0.1', port });
journal.info('service identité démarré', { port });
