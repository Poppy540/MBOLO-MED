// API du service de téléconsultation. Toute requête (hors /sante) exige un jeton Keycloak valide.
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { ErreurDepot, type VerifierJeton, type Utilisateur } from '@mbolo/identite';
import type { Journal } from '@mbolo/journal-securise';
import { ErreurTeleconsultation, type ServiceTeleconsultation } from './rendez-vous.js';

class ErreurAuthentification extends Error {}

const ID = { type: 'string', pattern: '^[A-Za-z0-9\\-.]{1,64}$' } as const;

export function creerServeur(o: {
  verifierJeton: VerifierJeton;
  service: ServiceTeleconsultation;
  journal: Journal;
}): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 8 * 1024 });

  const authentifier = async (req: FastifyRequest): Promise<Utilisateur> => {
    const entete = req.headers.authorization;
    if (!entete?.startsWith('Bearer ')) throw new ErreurAuthentification();
    try {
      return await o.verifierJeton(entete.slice('Bearer '.length));
    } catch {
      throw new ErreurAuthentification();
    }
  };

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ErreurAuthentification) {
      return reply.code(401).send({ erreur: 'Authentification requise.' });
    }
    if (err instanceof ErreurTeleconsultation) {
      return reply.code(err.statut).send({ erreur: err.message });
    }
    if (err instanceof ErreurDepot) {
      if (err.statut === 503) o.journal.erreur('dossier médical indisponible', { err });
      return reply.code(err.statut).send({ erreur: err.message });
    }
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({ erreur: 'Requête invalide.' });
    }
    o.journal.erreur('erreur interne de la téléconsultation', { err });
    return reply.code(500).send({ erreur: 'Erreur interne.' });
  });

  app.get('/sante', async () => ({ statut: 'ok' }));

  app.post<{ Body: { praticienId: string; debut: string; dureeMinutes: number } }>(
    '/rendez-vous',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['praticienId', 'debut', 'dureeMinutes'],
          properties: {
            praticienId: ID,
            debut: { type: 'string', format: 'date-time' },
            dureeMinutes: { type: 'integer', minimum: 5, maximum: 120 },
          },
        },
      },
    },
    async (req, reply) => {
      const u = await authentifier(req);
      const r = await o.service.demander(u, req.body);
      o.journal.info('rendez-vous vidéo demandé', { sujet: u.sujet, rendezVousId: r.id });
      return reply.code(201).send(r);
    },
  );

  app.get('/rendez-vous', async (req) => {
    const u = await authentifier(req);
    return { rendezVous: await o.service.mesRendezVous(u) };
  });

  app.post<{ Params: { id: string } }>(
    '/rendez-vous/:id/salle',
    {
      schema: { params: { type: 'object', properties: { id: ID }, required: ['id'] } },
    },
    async (req) => {
      const u = await authentifier(req);
      const acces = await o.service.rejoindre(u, req.params.id);
      // Le jeton de salle n'est jamais journalisé.
      o.journal.info('entrée en salle de téléconsultation autorisée', {
        sujet: u.sujet,
        rendezVousId: req.params.id,
      });
      return acces;
    },
  );

  app.post<{ Params: { id: string } }>(
    '/rendez-vous/:id/annulation',
    {
      schema: { params: { type: 'object', properties: { id: ID }, required: ['id'] } },
    },
    async (req) => {
      const u = await authentifier(req);
      const r = await o.service.annuler(u, req.params.id);
      o.journal.info('rendez-vous annulé', { sujet: u.sujet, rendezVousId: r.id });
      return r;
    },
  );

  return app;
}
