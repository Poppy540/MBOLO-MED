// API du service de téléconsultation. Toute requête (hors /sante) exige un jeton Keycloak valide.
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  ErreurDepot,
  type VerifierJeton,
  type Utilisateur,
  entetesSecurite,
} from '@mbolo/identite';
import { signalerAlerte, type Journal } from '@mbolo/journal-securise';
import { ErreurCreneau } from './creneaux.js';
import {
  CRENEAUX_MAX,
  ErreurTeleconsultation,
  type ServiceTeleconsultation,
} from './rendez-vous.js';

class ErreurAuthentification extends Error {}

const ID = { type: 'string', pattern: '^[A-Za-z0-9\\-.]{1,64}$' } as const;

/** Limites d'appels par adresse et par minute (protection contre la saturation du dossier). */
export interface Limites {
  parMinute: number;
  /** Statut d'identité : lu dans le dossier à chaque appel, donc plus strict. */
  identiteParMinute: number;
}

export const LIMITES_PAR_DEFAUT: Limites = { parMinute: 300, identiteParMinute: 30 };

export async function creerServeur(o: {
  verifierJeton: VerifierJeton;
  service: ServiceTeleconsultation;
  journal: Journal;
  limites?: Limites;
  /** Derrière un proxy de confiance, l'adresse du client est lue dans X-Forwarded-For. */
  trustProxy?: boolean;
}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 8 * 1024, trustProxy: o.trustProxy ?? false });
  // Revue ASVS n°1 (C1) : ni cache ni devinette de type sur les réponses.
  entetesSecurite(app);
  const limites = o.limites ?? LIMITES_PAR_DEFAUT;
  // Toutes les routes sont limitées ; enregistré avant elles.
  await app.register(rateLimit, { max: limites.parMinute, timeWindow: '1 minute' });

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
    if ((err as { statusCode?: number }).statusCode === 429) {
      signalerAlerte(o.journal, 'limite-appels', 'limite d’appels atteinte');
      return reply.code(429).send({ erreur: 'Trop de requêtes. Réessayez dans une minute.' });
    }
    if (err instanceof ErreurTeleconsultation || err instanceof ErreurCreneau) {
      return reply.code(err.statut).send({ erreur: err.message });
    }
    if (err instanceof ErreurDepot) {
      if (err.statut === 503)
        signalerAlerte(o.journal, 'erreur-serveur', 'dossier médical indisponible', { err });
      return reply.code(err.statut).send({ erreur: err.message });
    }
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({ erreur: 'Requête invalide.' });
    }
    signalerAlerte(o.journal, 'erreur-serveur', 'erreur interne de la téléconsultation', { err });
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

  // Statut de la vérification d'identité du patient (ADR-0014), sans aucune donnée d'identité.
  app.get(
    '/identite',
    { config: { rateLimit: { max: limites.identiteParMinute, timeWindow: '1 minute' } } },
    async (req) => ({ statut: await o.service.statutIdentite(await authentifier(req)) }),
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

  // Où en est le paiement d'une réservation (ADR-0017) : confirmée si payée, annulée après le délai.
  app.post<{ Params: { id: string } }>(
    '/rendez-vous/:id/paiement',
    {
      schema: { params: { type: 'object', properties: { id: ID }, required: ['id'] } },
    },
    async (req) => {
      const u = await authentifier(req);
      const r = await o.service.verifierPaiement(u, req.params.id);
      o.journal.info('paiement de la réservation vérifié', {
        sujet: u.sujet,
        rendezVousId: r.id,
        statut: r.statut,
      });
      return r;
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
