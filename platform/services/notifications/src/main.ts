// Démarrage du service de notifications (ADR-0012). Secret du compte de service
// (clé privée NOTIFICATIONS_SERVICE_CLE_PRIVEE, ADR-0016) depuis le coffre-fort, jamais le dépôt.
import { authentificationDepuis, creerFournisseurJeton, exigerHttps } from '@mbolo/identite';
import { creerJournal } from '@mbolo/journal-securise';
import { PAYS_PAR_DEFAUT, verifierPays, type Pays } from './gabarits.js';
import { ContactsFhir } from './dossier.js';
import { creerVerificateurAppelant } from './jeton.js';
import { LimiteCodes } from './limite-codes.js';
import { CanalSimule, ServiceNotifications } from './notifications.js';
import { creerServeur } from './serveur.js';

const journal = creerJournal({ service: 'notifications' });
const env = process.env;
const emetteur = env['KEYCLOAK_ISSUER'];
const fhir = env['FHIR_BASE_URL'];
const authentification = authentificationDepuis(env, 'NOTIFICATIONS');

if (!emetteur || !fhir || !authentification) {
  journal.erreur(
    'KEYCLOAK_ISSUER, FHIR_BASE_URL et NOTIFICATIONS_SERVICE_CLE_PRIVEE (ou le secret pendant la bascule) sont obligatoires.',
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

// Limite des codes de double authentification par dossier (ADR-0022) : un entier positif, sinon
// aucune limite ne s'appliquerait.
const codesParHeure = Number(env['NOTIFICATIONS_CODES_PAR_HEURE'] ?? '10');
if (!Number.isInteger(codesParHeure) || codesParHeure < 1) {
  journal.erreur('NOTIFICATIONS_CODES_PAR_HEURE doit être un entier positif.');
  process.exit(1);
}

const entetes = creerFournisseurJeton({
  emetteur,
  client: env['NOTIFICATIONS_SERVICE_CLIENT_ID'] ?? 'mbolo-notifications-service',
  authentification,
});
const canal = new CanalSimule();
// Revue ASVS n°1 (C2) : en production, uniquement des adresses chiffrées (HTTPS, WSS).
try {
  exigerHttps(
    {
      KEYCLOAK_ISSUER: env['KEYCLOAK_ISSUER'],
      FHIR_BASE_URL: env['FHIR_BASE_URL'],
    },
    env['MBOLO_ENV'] === 'prod',
  );
} catch (e) {
  journal.erreur('adresses non chiffrées refusées en production', { err: e });
  process.exit(1);
}

const app = await creerServeur({
  trustProxy: env['NOTIFICATIONS_TRUST_PROXY'] === 'true',
  limiteParMinute: Number(env['NOTIFICATIONS_LIMITE_PAR_MINUTE'] ?? '600'),
  verifierAppelant: creerVerificateurAppelant({
    emetteur,
    audience: env['NOTIFICATIONS_AUDIENCE'] ?? 'mbolo-notifications',
    clientsAutorises: (
      env['NOTIFICATIONS_CLIENTS_AUTORISES'] ??
      'mbolo-teleconsultation-service,mbolo-invitations-service,mbolo-keycloak-inscription'
    )
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  }),
  service: new ServiceNotifications(new ContactsFhir({ base: fhir, entetes }), canal, pays),
  journal,
  simulation: canal,
  // Invitations de proches (ADR-0019) : seul le service invitations peut les envoyer.
  invitations: {
    canal,
    pays,
    appelants: (env['NOTIFICATIONS_APPELANTS_INVITATION'] ?? 'mbolo-invitations-service')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  },
  // Codes de double authentification des patients (ADR-0022) : seule l'extension Keycloak.
  codesConnexion: {
    appelants: (env['NOTIFICATIONS_APPELANTS_CODE'] ?? 'mbolo-keycloak-inscription')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    // Par dossier, toutes sessions confondues (10 par heure par défaut).
    limite: new LimiteCodes(codesParHeure),
    limiteParNumero: new LimiteCodes(codesParHeure),
  },
});
const port = Number(env['PORT'] ?? '3004');
// Par défaut, seulement la machine locale ; `NOTIFICATIONS_HOST` permet à un Keycloak en conteneur
// de joindre le service (CI : code de double authentification, ADR-0022).
await app.listen({ host: env['NOTIFICATIONS_HOST'] ?? '127.0.0.1', port });
journal.info('service de notifications démarré (canal simulé)', { port, ...pays });
