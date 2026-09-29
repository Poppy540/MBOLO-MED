// API du service de notifications : réservée aux services autorisés (jeton de service).
import rateLimit from '@fastify/rate-limit';
import { entetesSecurite } from '@mbolo/identite';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { signalerAlerte, type Journal } from '@mbolo/journal-securise';
import {
  ALERTES_PATIENT,
  FORMAT_CODE,
  FORMAT_CODE_CONNEXION,
  IDENTIFIANTS_GABARITS,
  PAYS_PAR_DEFAUT,
  type AlertePatient,
  type Gabarit,
  type Pays,
} from './gabarits.js';
import type { VerifierAppelant } from './jeton.js';
import {
  envoyerInvitationProche,
  type Canal,
  type CanalSimule,
  type Destinataire,
  type ServiceNotifications,
} from './notifications.js';

class ErreurAuthentification extends Error {}
class ErreurInterdite extends Error {}

export async function creerServeur(o: {
  verifierAppelant: VerifierAppelant;
  service: ServiceNotifications;
  journal: Journal;
  /** Canal simulé : sa boîte est consultable (développement et tests uniquement). */
  simulation?: CanalSimule;
  /** Appels permis par adresse et par minute (défaut : 600). */
  limiteParMinute?: number;
  /** Derrière un proxy de confiance, l'adresse du client est lue dans X-Forwarded-For (limites d'appels). */
  trustProxy?: boolean;
  /**
   * Invitations de proches (ADR-0019) : canal d'envoi, pays, et seuls clients autorisés
   * (le service invitations). Ces clients n'envoient rien d'autre.
   */
  invitations?: { canal: Canal; pays?: Pays; appelants: readonly string[] };
  /**
   * Codes de double authentification (ADR-0022) : seuls clients autorisés (l'extension Keycloak).
   * Ces clients n'envoient rien d'autre.
   */
  codesConnexion?: { appelants: readonly string[] };
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: o.trustProxy ?? false,
    bodyLimit: 4 * 1024,
    // Un champ inconnu (ex. un texte libre) est refusé, pas silencieusement retiré.
    ajv: { customOptions: { removeAdditional: false } },
  });
  // Revue ASVS n°1 (C1) : ni cache ni devinette de type sur les réponses.
  entetesSecurite(app);
  // Toutes les routes sont limitées ; enregistré avant elles.
  await app.register(rateLimit, { max: o.limiteParMinute ?? 600, timeWindow: '1 minute' });

  const authentifier = async (req: FastifyRequest): Promise<string> => {
    const entete = req.headers.authorization;
    if (!entete?.startsWith('Bearer ')) throw new ErreurAuthentification();
    try {
      return await o.verifierAppelant(entete.slice('Bearer '.length));
    } catch {
      throw new ErreurAuthentification();
    }
  };

  app.setErrorHandler((err, _req, reply) => {
    if ((err as { statusCode?: number }).statusCode === 429) {
      signalerAlerte(o.journal, 'limite-appels', 'limite d’appels atteinte');
      return reply.code(429).send({ erreur: 'Trop de requêtes. Réessayez dans une minute.' });
    }
    if (err instanceof ErreurAuthentification) {
      return reply.code(401).send({ erreur: 'Authentification requise.' });
    }
    if (err instanceof ErreurInterdite) return reply.code(403).send({ erreur: 'Accès refusé.' });
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({ erreur: 'Requête invalide.' });
    }
    signalerAlerte(o.journal, 'erreur-serveur', 'erreur interne des notifications', { err });
    return reply.code(500).send({ erreur: 'Erreur interne.' });
  });

  app.get('/sante', async () => ({ statut: 'ok' }));

  app.post<{ Body: { destinataire: Destinataire; gabarit: Gabarit; instant: string } }>(
    '/notifications',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['destinataire', 'gabarit', 'instant'],
          properties: {
            destinataire: {
              type: 'string',
              pattern: '^(Patient|Practitioner)/[A-Za-z0-9\\-.]{1,64}$',
            },
            gabarit: { type: 'string', enum: [...IDENTIFIANTS_GABARITS] },
            instant: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (req, reply) => {
      const appelant = await authentifier(req);
      if (
        o.invitations?.appelants.includes(appelant) ||
        o.codesConnexion?.appelants.includes(appelant)
      ) {
        throw new ErreurInterdite();
      }
      const { destinataire, gabarit, instant } = req.body;
      const resultat = await o.service.envoyer({
        destinataire,
        gabarit,
        variables: { instant },
      });
      // Jamais le numéro ni le texte ; le type de destinataire seulement.
      o.journal.info('notification traitée', {
        appelant,
        gabarit,
        typeDestinataire: destinataire.split('/')[0],
        resultat,
      });
      return reply.code(202).send({ resultat });
    },
  );

  const invitations = o.invitations;
  if (invitations) {
    app.post<{ Body: { telephone: string; code: string; jours: number } }>(
      '/invitations-proche',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['telephone', 'code', 'jours'],
            properties: {
              // Format international (E.164) : le proche vit souvent à l'étranger.
              telephone: { type: 'string', pattern: '^\\+[1-9][0-9]{7,14}$' },
              code: { type: 'string', pattern: FORMAT_CODE.source },
              jours: { type: 'integer', minimum: 1, maximum: 90 },
            },
          },
        },
      },
      async (req, reply) => {
        const appelant = await authentifier(req);
        if (!invitations.appelants.includes(appelant)) throw new ErreurInterdite();
        const resultat = await envoyerInvitationProche(
          invitations.canal,
          req.body,
          invitations.pays ?? PAYS_PAR_DEFAUT,
        );
        // Ni le numéro ni le code : seulement le résultat.
        o.journal.info('invitation de proche traitée', { appelant, resultat });
        return reply.code(202).send({ resultat });
      },
    );

    // Alertes au patient (ADR-0019) : son proche a créé son compte ; l'équipe a retiré ses proches.
    app.post<{ Params: { alerte: AlertePatient }; Body: { patientId: string } }>(
      '/alertes/:alerte',
      {
        schema: {
          params: {
            type: 'object',
            required: ['alerte'],
            properties: { alerte: { type: 'string', enum: Object.keys(ALERTES_PATIENT) } },
          },
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['patientId'],
            properties: { patientId: { type: 'string', pattern: '^[A-Za-z0-9\\-.]{1,64}$' } },
          },
        },
      },
      async (req, reply) => {
        const appelant = await authentifier(req);
        if (!invitations.appelants.includes(appelant)) throw new ErreurInterdite();
        const resultat = await o.service.alerterPatient(req.body.patientId, req.params.alerte);
        o.journal.info('alerte au patient traitée', {
          appelant,
          alerte: req.params.alerte,
          resultat,
        });
        return reply.code(202).send({ resultat });
      },
    );
  }

  const codes = o.codesConnexion;
  if (codes) {
    // Double authentification du patient (ADR-0022) : seule l'extension Keycloak demande l'envoi.
    app.post<{ Body: { patientId: string; code: string } }>(
      '/codes-connexion',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['patientId', 'code'],
            properties: {
              patientId: { type: 'string', pattern: '^[A-Za-z0-9\\-.]{1,64}$' },
              code: { type: 'string', pattern: FORMAT_CODE_CONNEXION.source },
            },
          },
        },
      },
      async (req, reply) => {
        const appelant = await authentifier(req);
        if (!codes.appelants.includes(appelant)) throw new ErreurInterdite();
        const resultat = await o.service.envoyerCodeConnexion(req.body.patientId, req.body.code);
        // Ni le code ni le numéro : le dossier et le résultat.
        o.journal.info('code de connexion traité', {
          appelant,
          patientId: req.body.patientId,
          resultat,
        });
        return reply.code(202).send({ resultat });
      },
    );
  }

  if (o.simulation) {
    const boite = o.simulation.boite;
    // Même authentification que l'envoi : les numéros (fictifs) ne sont jamais en accès libre.
    app.get('/simulation/boite', async (req) => {
      await authentifier(req);
      return { messages: boite };
    });
  }

  return app;
}
