// API du service de notifications : réservée aux services autorisés (jeton de service).
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Journal } from '@mbolo/journal-securise';
import { IDENTIFIANTS_GABARITS, type Gabarit } from './gabarits.js';
import type { VerifierAppelant } from './jeton.js';
import type { CanalSimule, Destinataire, ServiceNotifications } from './notifications.js';

class ErreurAuthentification extends Error {}

export function creerServeur(o: {
  verifierAppelant: VerifierAppelant;
  service: ServiceNotifications;
  journal: Journal;
  /** Canal simulé : sa boîte est consultable (développement et tests uniquement). */
  simulation?: CanalSimule;
}): FastifyInstance {
  const app = Fastify({
    logger: false,
    bodyLimit: 4 * 1024,
    // Un champ inconnu (ex. un texte libre) est refusé, pas silencieusement retiré.
    ajv: { customOptions: { removeAdditional: false } },
  });

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
    if (err instanceof ErreurAuthentification) {
      return reply.code(401).send({ erreur: 'Authentification requise.' });
    }
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({ erreur: 'Requête invalide.' });
    }
    o.journal.erreur('erreur interne des notifications', { err });
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
