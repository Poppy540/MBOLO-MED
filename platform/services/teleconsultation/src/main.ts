// Démarrage du service de téléconsultation (prototype, ADR-0011). Secrets : clé et secret d'API
// LiveKit (WEBRTC_API_KEY, WEBRTC_API_SECRET), depuis le coffre-fort, jamais le dépôt.
import { drapeauxFixes, drapeauxUnleash } from '@mbolo/drapeaux';
import {
  authentificationDepuis,
  creerFournisseurJeton,
  creerVerificateur,
  exigerHttps,
} from '@mbolo/identite';
import { creerJournal, signalerAlerte } from '@mbolo/journal-securise';
import { type DepotCreneaux, DepotCreneauxMemoire } from './creneaux.js';
import { AnnuaireFhir, AnnuaireMemoire, type Annuaire } from './annuaire.js';
import { IdentitesFhir, IdentitesMemoire, type Identites } from './identites.js';
import { DepotCreneauxFhir, DepotRendezVousFhir } from './depot-fhir.js';
import { aucunNotificateur, type Notificateur, NotificateurHttp } from './notificateur.js';
import { PaiementsHttp, type Paiements } from './paiements.js';
import {
  type DepotRendezVous,
  DepotRendezVousMemoire,
  ServiceTeleconsultation,
} from './rendez-vous.js';
import { SalleLiveKit } from './salle-livekit.js';
import { creerServeur, LIMITES_PAR_DEFAUT } from './serveur.js';

const journal = creerJournal({ service: 'teleconsultation' });
const env = process.env;
const emetteur = env['KEYCLOAK_ISSUER'];
const url = env['WEBRTC_SERVER_URL'];
const cle = env['WEBRTC_API_KEY'];
const secret = env['WEBRTC_API_SECRET'];

if (!emetteur || !url || !cle || !secret) {
  journal.erreur(
    'KEYCLOAK_ISSUER, WEBRTC_SERVER_URL, WEBRTC_API_KEY et WEBRTC_API_SECRET sont obligatoires.',
  );
  process.exit(1);
}
if (env['MBOLO_ENV'] === 'prod') {
  // Prototype : test terrain LiveKit à faire (ADR-0011), hébergement et avis juridique en attente.
  journal.erreur('Prototype : le service ne démarre pas en production.');
  process.exit(1);
}

// Rendez-vous dans le dossier médical (Appointment), via la passerelle et un compte de service
// limité aux rendez-vous. Sans FHIR_BASE_URL : en mémoire (développement seulement).
let depot: DepotRendezVous;
let creneaux: DepotCreneaux;
// Notifications (ADR-0012) : même jeton de service, audience mbolo-notifications.
let notificateur: Notificateur = aucunNotificateur;
let annuaire: Annuaire = new AnnuaireMemoire();
// Sans dossier FHIR, aucune identité n'est connue : aucune réservation (ADR-0014).
let identites: Identites = new IdentitesMemoire();
// Paiement des réservations (ADR-0017) : même jeton de service, audience mbolo-paiement-api.
let paiements: Paiements | undefined;
const fhir = env['FHIR_BASE_URL'];
if (fhir) {
  const authService = authentificationDepuis(env, 'TELECONSULTATION');
  if (!authService) {
    journal.erreur(
      'compte de service : clé privée TELECONSULTATION_SERVICE_CLE_PRIVEE (ou, pendant la bascule, secret TELECONSULTATION_SERVICE_CLIENT_SECRET) manquante : accès au dossier impossible.',
    );
    process.exit(1);
  }
  const entetes = creerFournisseurJeton({
    emetteur,
    client: env['TELECONSULTATION_SERVICE_CLIENT_ID'] ?? 'mbolo-teleconsultation-service',
    authentification: authService,
  });
  depot = new DepotRendezVousFhir({ base: fhir, entetes }, 'dev');
  creneaux = new DepotCreneauxFhir({ base: fhir, entetes }, 'dev');
  annuaire = new AnnuaireFhir({ base: fhir, entetes });
  identites = new IdentitesFhir({ base: fhir, entetes });
  journal.info('rendez-vous enregistrés dans le dossier FHIR (passerelle authentifiée)');
  if (env['NOTIFICATIONS_URL']) {
    notificateur = new NotificateurHttp({ url: env['NOTIFICATIONS_URL'], entetes, journal });
  }
  if (env['PAIEMENT_URL'])
    paiements = new PaiementsHttp({ url: env['PAIEMENT_URL'], entetes, journal });
} else {
  depot = new DepotRendezVousMemoire();
  creneaux = new DepotCreneauxMemoire();
  journal.avertissement('FHIR_BASE_URL absent : rendez-vous en mémoire (perdus à l’arrêt).');
}

const drapeaux =
  env['UNLEASH_API_URL'] && env['UNLEASH_BACKEND_TOKEN']
    ? await drapeauxUnleash({
        url: env['UNLEASH_API_URL'],
        jeton: env['UNLEASH_BACKEND_TOKEN'],
        application: 'teleconsultation',
        rafraichissementMs: Number(env['UNLEASH_REFRESH_MS'] ?? '15000'),
      })
    : await drapeauxFixes();

const delaiMinutes = Number(env['TELECONSULTATION_DELAI_PAIEMENT_MINUTES'] ?? '15');
// Fraction de minute acceptée pour les tests de bout en bout (ex. 0.25 = 15 s).
if (!Number.isFinite(delaiMinutes) || delaiMinutes <= 0 || delaiMinutes > 120) {
  journal.erreur('TELECONSULTATION_DELAI_PAIEMENT_MINUTES : nombre de minutes, 120 au plus.');
  process.exit(1);
}
const service = new ServiceTeleconsultation(
  depot,
  creneaux,
  new SalleLiveKit({ url, cle, secret }),
  drapeaux,
  () => new Date(),
  notificateur,
  annuaire,
  identites,
  paiements ? { service: paiements, delaiMinutes } : undefined,
);

// Réservations non payées : confirmées si payées entre-temps, sinon annulées après le délai et le
// créneau rendu. Un passage à la fois ; le paiement injoignable n'annule jamais rien.
if (paiements) {
  let enCours = false;
  const intervalle = Number(env['TELECONSULTATION_EXPIRATION_INTERVALLE_MS'] ?? '60000');
  setInterval(() => {
    if (enCours) return;
    enCours = true;
    service
      .expirerPaiements()
      .then((bilan) => {
        if (bilan.confirmes || bilan.annules || bilan.reportes) {
          journal.info('réservations en attente de paiement traitées', { ...bilan });
        }
      })
      .catch((e: unknown) =>
        journal.avertissement('expiration des réservations impossible', { err: e }),
      )
      .finally(() => {
        enCours = false;
      });
  }, intervalle).unref();
}

// ADR-0026, étape 5 : rendez-vous à venir d'un professionnel suspendu ou à revérifier, signalés à
// l'équipe assistance-patient (nombre seulement, jamais de patient dans l'alerte), toutes les heures.
const signalerAReprendre = async (): Promise<void> => {
  try {
    const n = (await service.aReprendre()).length;
    if (n > 0) {
      signalerAlerte(
        journal,
        'rendez-vous-a-reprendre',
        'rendez-vous à venir chez un professionnel qui n’est plus vérifié',
        { nombre: n },
      );
    }
  } catch (e) {
    journal.avertissement('recherche des rendez-vous à reprendre impossible', { err: e });
  }
};
await signalerAReprendre();
setInterval(() => void signalerAReprendre(), 3_600_000).unref();

// Revue ASVS n°1 (C2) : en production, uniquement des adresses chiffrées (HTTPS, WSS).
try {
  exigerHttps(
    {
      KEYCLOAK_ISSUER: env['KEYCLOAK_ISSUER'],
      FHIR_BASE_URL: env['FHIR_BASE_URL'],
      NOTIFICATIONS_URL: env['NOTIFICATIONS_URL'],
      PAIEMENT_URL: env['PAIEMENT_URL'],
      UNLEASH_API_URL: env['UNLEASH_API_URL'],
      WEBRTC_SERVER_URL: env['WEBRTC_SERVER_URL'],
    },
    env['MBOLO_ENV'] === 'prod',
  );
} catch (e) {
  journal.erreur('adresses non chiffrées refusées en production', { err: e });
  process.exit(1);
}

const app = await creerServeur({
  verifierJeton: creerVerificateur({
    emetteur,
    audience: env['TELECONSULTATION_AUDIENCE'] ?? 'mbolo-teleconsultation-api',
  }),
  service,
  journal,
  limites: {
    parMinute: Number(env['TELECONSULTATION_LIMITE_PAR_MINUTE'] ?? LIMITES_PAR_DEFAUT.parMinute),
    identiteParMinute: Number(
      env['TELECONSULTATION_LIMITE_IDENTITE_PAR_MINUTE'] ?? LIMITES_PAR_DEFAUT.identiteParMinute,
    ),
  },
  trustProxy: env['TELECONSULTATION_TRUST_PROXY'] === 'true',
});
const port = Number(env['PORT'] ?? '3003');
await app.listen({ host: '127.0.0.1', port });
journal.info('service de téléconsultation démarré', { port });
