// API HTTP du service identité. Toute requête (hors /sante) exige un jeton Keycloak valide.
// Chaque décision d'accès est journalisée (journal sécurisé : aucune donnée de santé en clair).
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { CATEGORIES_CONSENTEMENT, MODES_RECUEIL } from '@mbolo/dossier-fhir';
import type { Journal } from '@mbolo/journal-securise';
import { deciderAccesDossier } from './acces.js';
import {
  ErreurAcces,
  ErreurValidation,
  type DemandeConsentement,
  type ServiceConsentements,
  type DepotConsentements,
} from './consentements.js';
import { ErreurDepot } from './depot-fhir.js';
import type { VerifierJeton } from './jeton.js';
import type { Utilisateur } from './roles.js';

export interface OptionsServeur {
  verifierJeton: VerifierJeton;
  consentements: ServiceConsentements;
  depot: DepotConsentements;
  journal: Journal;
}

class ErreurAuthentification extends Error {}

const ID = { type: 'string', pattern: '^[A-Za-z0-9\\-.]{1,64}$' } as const;
const REFERENCE = {
  type: 'string',
  pattern: '^(Practitioner|RelatedPerson)/[A-Za-z0-9\\-.]{1,64}$',
} as const;

export function creerServeur(o: OptionsServeur): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 16 * 1024 });

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
    if (err instanceof ErreurAcces) return reply.code(403).send({ erreur: 'Accès refusé.' });
    if (err instanceof ErreurDepot) {
      if (err.statut === 503) o.journal.erreur('dossier médical indisponible', { err });
      return reply.code(err.statut).send({ erreur: err.message });
    }
    if (err instanceof ErreurValidation) {
      return reply.code(422).send({ erreur: err.message, regles: err.regles });
    }
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({ erreur: 'Requête invalide.' });
    }
    o.journal.erreur('erreur interne', { err });
    return reply.code(500).send({ erreur: 'Erreur interne.' });
  });

  app.get('/sante', async () => ({ statut: 'ok' }));

  app.get<{ Params: { patientId: string } }>(
    '/patients/:patientId/consentements',
    {
      schema: {
        params: { type: 'object', properties: { patientId: ID }, required: ['patientId'] },
      },
    },
    async (req) => {
      const u = await authentifier(req);
      const liste = await o.consentements.lister(u, req.params.patientId);
      o.journal.info('consentements lus', { sujet: u.sujet, patientId: req.params.patientId });
      return { consentements: liste };
    },
  );

  app.post<{ Params: { patientId: string }; Body: DemandeConsentement }>(
    '/patients/:patientId/consentements',
    {
      schema: {
        params: { type: 'object', properties: { patientId: ID }, required: ['patientId'] },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['categorie', 'mode', 'versionTexte', 'accepte'],
          properties: {
            categorie: { type: 'string', enum: [...CATEGORIES_CONSENTEMENT] },
            mode: { type: 'string', enum: [...MODES_RECUEIL] },
            versionTexte: { type: 'string', minLength: 1, maxLength: 200 },
            accepte: { type: 'boolean' },
            beneficiaire: REFERENCE,
          },
        },
      },
    },
    async (req, reply) => {
      const u = await authentifier(req);
      const c = await o.consentements.enregistrer(u, req.params.patientId, req.body);
      o.journal.info('consentement enregistré', {
        sujet: u.sujet,
        patientId: req.params.patientId,
        categorie: req.body.categorie,
        accepte: req.body.accepte,
        consentementId: c.id,
      });
      return reply.code(201).send(c);
    },
  );

  app.post<{ Params: { consentementId: string } }>(
    '/consentements/:consentementId/revocation',
    {
      schema: {
        params: {
          type: 'object',
          properties: { consentementId: ID },
          required: ['consentementId'],
        },
      },
    },
    async (req) => {
      const u = await authentifier(req);
      const c = await o.consentements.revoquer(u, req.params.consentementId);
      o.journal.info('consentement révoqué', { sujet: u.sujet, consentementId: c.id });
      return c;
    },
  );

  // Point de décision d'accès (PDP) : utilisé par la passerelle du dossier FHIR avant toute lecture.
  app.post<{ Body: { patientId: string; brisDeGlace?: { motif: string } } }>(
    '/acces/dossier',
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
      const u = await authentifier(req);
      const consentements = await o.depot.parPatient(req.body.patientId);
      const decision = deciderAccesDossier(u, req.body, consentements);
      const contexte = {
        sujet: u.sujet,
        roles: u.roles,
        patientId: req.body.patientId,
        autorise: decision.autorise,
        motifDecision: decision.motif,
      };
      if (decision.audit === 'alerte') {
        o.journal.avertissement('ACCÈS BRIS DE GLACE — revue humaine requise', contexte);
      } else {
        o.journal.info('décision d’accès au dossier', contexte);
      }
      return decision;
    },
  );

  return app;
}
