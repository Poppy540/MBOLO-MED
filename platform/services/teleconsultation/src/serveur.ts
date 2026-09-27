// API du service de téléconsultation. Toute requête (hors /sante) exige un jeton Keycloak valide.
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { ErreurDepot, type VerifierJeton, type Utilisateur } from '@mbolo/identite';
import type { Journal } from '@mbolo/journal-securise';
import { ErreurCreneau } from './creneaux.js';
import {
  CRENEAUX_MAX,
  ErreurTeleconsultation,
  type ServiceTeleconsultation,
} from './rendez-vous.js';

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
    if (err instanceof ErreurTeleconsultation || err instanceof ErreurCreneau) {
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

  // Le professionnel publie des créneaux consécutifs (aucun texte libre).
  app.post<{ Body: { debut: string; dureeMinutes: number; nombre: number } }>(
    '/creneaux',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['debut', 'dureeMinutes', 'nombre'],
          properties: {
            debut: { type: 'string', format: 'date-time' },
            dureeMinutes: { type: 'integer', minimum: 5, maximum: 120 },
            nombre: { type: 'integer', minimum: 1, maximum: CRENEAUX_MAX },
          },
        },
      },
    },
    async (req, reply) => {
      const u = await authentifier(req);
      const creneaux = await o.service.publier(u, req.body);
      o.journal.info('créneaux publiés', { sujet: u.sujet, nombre: creneaux.length });
      return reply.code(201).send({ creneaux });
    },
  );

  app.get('/praticiens', async (req) => {
    const u = await authentifier(req);
    return { praticiens: await o.service.praticiens(u) };
  });

  app.get('/creneaux', async (req) => {
    const u = await authentifier(req);
    return { creneaux: await o.service.mesCreneaux(u) };
  });

  app.get<{ Params: { id: string } }>(
    '/praticiens/:id/creneaux',
    {
      schema: { params: { type: 'object', properties: { id: ID }, required: ['id'] } },
    },
    async (req) => {
      const u = await authentifier(req);
      return { creneaux: await o.service.creneauxLibres(u, req.params.id) };
    },
  );

  app.post<{ Body: { creneauId: string } }>(
    '/rendez-vous',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['creneauId'],
          properties: { creneauId: ID },
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

  app.post<{ Params: { id: string }; Body: { creneauId: string } }>(
    '/rendez-vous/:id/report',
    {
      schema: {
        params: { type: 'object', properties: { id: ID }, required: ['id'] },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['creneauId'],
          properties: { creneauId: ID },
        },
      },
    },
    async (req) => {
      const u = await authentifier(req);
      const r = await o.service.reporter(u, req.params.id, req.body);
      o.journal.info('rendez-vous reporté', { sujet: u.sujet, rendezVousId: r.id });
      return r;
    },
  );

  app.post<{ Params: { id: string } }>(
    '/creneaux/:id/retrait',
    {
      schema: { params: { type: 'object', properties: { id: ID }, required: ['id'] } },
    },
    async (req) => {
      const u = await authentifier(req);
      const c = await o.service.retirerCreneau(u, req.params.id);
      o.journal.info('créneau retiré', { sujet: u.sujet, creneauId: c.id });
      return c;
    },
  );

  return app;
}
