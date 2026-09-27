// Démarrage du service de consultation clinique. Secret du compte de service
// (CONSULTATION_SERVICE_CLIENT_SECRET) depuis le coffre-fort, jamais le dépôt.
import { creerFournisseurJeton, creerVerificateur } from '@mbolo/identite';
import { creerJournal } from '@mbolo/journal-securise';
import { DecideurIdentite } from './acces.js';
import { DossierFhir } from './dossier.js';
import { creerServeur } from './serveur.js';
import { ServiceConsultation } from './service.js';

const journal = creerJournal({ service: 'consultation' });
const env = process.env;
const emetteur = env['KEYCLOAK_ISSUER'];
const fhir = env['FHIR_BASE_URL'];
const identite = env['IDENTITE_URL'];
const secret = env['CONSULTATION_SERVICE_CLIENT_SECRET'];

if (!emetteur || !fhir || !identite || !secret) {
  journal.erreur(
    'KEYCLOAK_ISSUER, FHIR_BASE_URL, IDENTITE_URL et CONSULTATION_SERVICE_CLIENT_SECRET sont obligatoires.',
  );
  process.exit(1);
}
if (env['MBOLO_ENV'] === 'prod') {
  // Vague 1 non ouverte : comité médical, hébergement et avis juridique en attente.
  journal.erreur('Prototype : le service ne démarre pas en production.');
  process.exit(1);
}

const entetes = creerFournisseurJeton({
  emetteur,
  client: env['CONSULTATION_SERVICE_CLIENT_ID'] ?? 'mbolo-consultation-service',
  secret,
});
const app = await creerServeur({
  limiteParMinute: Number(env['CONSULTATION_LIMITE_PAR_MINUTE'] ?? '300'),
  verifierJeton: creerVerificateur({
    emetteur,
    audience: env['CONSULTATION_AUDIENCE'] ?? 'mbolo-consultation-api',
  }),
  service: new ServiceConsultation(
    new DecideurIdentite(identite),
    new DossierFhir({ base: fhir, entetes }),
    'dev',
  ),
  journal,
});
const port = Number(env['PORT'] ?? '3005');
await app.listen({ host: '127.0.0.1', port });
journal.info('service de consultation démarré', { port });
