// Démarrage de la passerelle du dossier. Aucun secret : elle vérifie des jetons publics signés
// par Keycloak ; le serveur FHIR interne n'est joignable que par elle.
import { creerJournal } from '@mbolo/journal-securise';
import { creerVerificateur } from './jeton.js';
import { creerPasserelle } from './passerelle.js';

const emetteur = process.env['KEYCLOAK_ISSUER'];
const amont = process.env['FHIR_AMONT_URL'];
const audience = process.env['PASSERELLE_AUDIENCE'] ?? 'mbolo-dossier-fhir';
const port = Number(process.env['PORT'] ?? '3002');
const publique = process.env['PASSERELLE_URL_PUBLIQUE'] ?? `http://127.0.0.1:${port}/fhir`;
const env = process.env['MBOLO_ENV'] === 'prod' ? 'prod' : 'dev';

const journal = creerJournal({ service: 'passerelle-fhir' });

if (!emetteur || !amont) {
  journal.erreur('KEYCLOAK_ISSUER et FHIR_AMONT_URL sont obligatoires : arrêt.');
  process.exit(1);
}
if (env === 'prod') {
  journal.erreur('Vague 0 : la passerelle ne démarre pas en production.');
  process.exit(1);
}

const app = await creerPasserelle({
  limiteParMinute: Number(process.env['PASSERELLE_LIMITE_PAR_MINUTE'] ?? '3000'),
  verifierJeton: creerVerificateur({ emetteur, audience }),
  amont,
  publique,
  env,
  journal,
});
// Par défaut, seulement la machine locale ; `PASSERELLE_HOST` permet à un Keycloak en conteneur de
// joindre la passerelle (CI : création du dossier à l'inscription, ADR-0014).
await app.listen({ host: process.env['PASSERELLE_HOST'] ?? '127.0.0.1', port });
journal.info('passerelle du dossier démarrée', { port });
