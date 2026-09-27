// API de consultation clinique. Toute requête (hors /sante) exige un jeton Keycloak valide ; le
// même jeton est présenté au service identite pour la décision d'accès au dossier.
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { ErreurDepot, type Utilisateur, type VerifierJeton } from '@mbolo/identite';
import type { Journal } from '@mbolo/journal-securise';
import { ErreurDecision } from './acces.js';
import { ErreurConsultation, type ServiceConsultation } from './service.js';

class ErreurAuthentification extends Error {}

const ID = { type: 'string', pattern: '^[A-Za-z0-9\\-.]{1,64}$' } as const;
const TEXTE = { type: 'string', maxLength: 4000 } as const;

export function creerServeur(o: {
  verifierJeton: VerifierJeton;
  service: ServiceConsultation;
  journal: Journal;
}): FastifyInstance {
  const app = Fastify({
    logger: false,
    bodyLimit: 32 * 1024,
    // Un champ inconnu est refusé, pas silencieusement retiré.
    ajv: { customOptions: { removeAdditional: false } },
  });

  const authentifier = async (
    req: FastifyRequest,
  ): Promise<{ utilisateur: Utilisateur; jeton: string }> => {
    const entete = req.headers.authorization;
    if (!entete?.startsWith('Bearer ')) throw new ErreurAuthentification();
    const jeton = entete.slice('Bearer '.length);
    try {
      return { utilisateur: await o.verifierJeton(jeton), jeton };
    } catch {
      throw new ErreurAuthentification();
    }
  };

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ErreurAuthentification) {
      return reply.code(401).send({ erreur: 'Authentification requise.' });
    }
    if (err instanceof ErreurConsultation) {
      return reply
        .code(err.statut)
        .send({ erreur: err.message, ...(err.motif ? { motif: err.motif } : {}) });
    }
    if (err instanceof ErreurDecision) {
      o.journal.erreur('décision d’accès indisponible');
      return reply.code(503).send({ erreur: 'Service momentanément indisponible.' });
    }
    if (err instanceof ErreurDepot) {
      if (err.statut === 503) o.journal.erreur('dossier médical indisponible', { err });
      return reply.code(err.statut).send({ erreur: err.message });
    }
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({ erreur: 'Requête invalide.' });
    }
    o.journal.erreur('erreur interne de la consultation', { err });
    return reply.code(500).send({ erreur: 'Erreur interne.' });
  });

  app.get('/sante', async () => ({ statut: 'ok' }));

  app.post<{ Body: { patientId: string; brisDeGlace?: { motif: string } } }>(
    '/dossiers/lecture',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['patientId'],
          properties: {
            patientId: ID,
            brisDeGlace: {
              type: 'object',
              additionalProperties: false,
              required: ['motif'],
              properties: { motif: { type: 'string', maxLength: 500 } },
            },
          },
        },
      },
    },
    async (req) => {
      const { utilisateur, jeton } = await authentifier(req);
      const resume = await o.service.dossier(jeton, req.body.patientId, req.body.brisDeGlace);
      // Jamais de contenu médical dans le journal.
      o.journal.info('dossier consulté', { sujet: utilisateur.sujet, motif: resume.motifAcces });
      return resume;
    },
  );

  app.post<{
    Params: { id: string };
    Body: { motif?: string; observations?: string; conclusion?: string; conduiteATenir?: string };
  }>(
    '/rendez-vous/:id/compte-rendu',
    {
      schema: {
        params: { type: 'object', properties: { id: ID }, required: ['id'] },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            motif: TEXTE,
            observations: TEXTE,
            conclusion: TEXTE,
            conduiteATenir: TEXTE,
          },
        },
      },
    },
    async (req, reply) => {
      const { utilisateur, jeton } = await authentifier(req);
      const { conduiteATenir, ...autres } = req.body;
      const r = await o.service.ecrireCompteRendu(utilisateur, jeton, req.params.id, {
        ...autres,
        ...(conduiteATenir !== undefined ? { 'conduite-a-tenir': conduiteATenir } : {}),
      });
      o.journal.info('compte-rendu enregistré', { sujet: utilisateur.sujet, compteRendu: r.id });
      return reply.code(201).send(r);
    },
  );

  return app;
}
