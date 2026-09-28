// Démarrage du service de consultation clinique. Secret du compte de service
// (clé privée CONSULTATION_SERVICE_CLE_PRIVEE, ADR-0016) depuis le coffre-fort, jamais le dépôt.
import { drapeauxFixes, drapeauxUnleash } from '@mbolo/drapeaux';
import { authentificationDepuis, creerFournisseurJeton, creerVerificateur } from '@mbolo/identite';
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
const authentification = authentificationDepuis(env, 'CONSULTATION');

if (!emetteur || !fhir || !identite || !authentification) {
  journal.erreur(
    'KEYCLOAK_ISSUER, FHIR_BASE_URL, IDENTITE_URL et CONSULTATION_SERVICE_CLE_PRIVEE (ou le secret pendant la bascule) sont obligatoires.',
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
  authentification,
});
const drapeaux =
  env['UNLEASH_API_URL'] && env['UNLEASH_BACKEND_TOKEN']
    ? await drapeauxUnleash({
        url: env['UNLEASH_API_URL'],
        jeton: env['UNLEASH_BACKEND_TOKEN'],
        application: 'consultation',
        rafraichissementMs: Number(env['UNLEASH_REFRESH_MS'] ?? '15000'),
      })
    : await drapeauxFixes();
const dossier = new DossierFhir({ base: fhir, entetes });

const app = await creerServeur({
  limiteParMinute: Number(env['CONSULTATION_LIMITE_PAR_MINUTE'] ?? '300'),
  verifierJeton: creerVerificateur({
    emetteur,
    audience: env['CONSULTATION_AUDIENCE'] ?? 'mbolo-consultation-api',
  }),
  service: new ServiceConsultation(
    new DecideurIdentite(identite),
    dossier,
    'dev',
    undefined,
    {
      dossier,
      drapeaux,
      // Nomenclature des médicaments du pays : ATC en attendant la liste nationale (ADR-0018).
      nomenclature: env['CONSULTATION_NOMENCLATURE_MEDICAMENTS'] ?? 'http://www.whocc.no/atc',
      // Validité par défaut, à confirmer par le comité médical et le juriste.
      validiteJours: Number(env['CONSULTATION_VALIDITE_ORDONNANCE_JOURS'] ?? '90'),
    },
    drapeaux,
  ),
  journal,
});
const port = Number(env['PORT'] ?? '3005');
await app.listen({ host: '127.0.0.1', port });
journal.info('service de consultation démarré', { port });
