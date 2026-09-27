// API des invitations. Création, liste et révocation : rôle gestion-invitations uniquement (humain,
// double authentification). Vérification d'un code : publique, mais limitée en nombre d'essais.
// Inscription (ADR-0014) : contrôle et utilisation d'un code par l'extension Keycloak seulement.
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Utilisateur, VerifierJeton } from '@mbolo/identite';
import type { Journal } from '@mbolo/journal-securise';
import type { VerifierService } from './jeton-service.js';
import type { Limiteur } from './limiteur.js';
import { COHORTE, ErreurInvitation, type ServiceInvitations } from './service.js';

class ErreurAuthentification extends Error {}
class ErreurInterdite extends Error {}

export const ROLE_GESTION = 'gestion-invitations';

export async function creerServeur(o: {
  verifierJeton: VerifierJeton;
  service: ServiceInvitations;
  limiteur: Limiteur;
  journal: Journal;
  /** Jetons de l'extension d'inscription de Keycloak ; sans lui, les routes /inscription sont absentes. */
  verifierService?: VerifierService;
  /** Derrière un proxy de confiance, l'adresse du client est lue dans X-Forwarded-For. */
  trustProxy?: boolean;
  /** Appels permis par adresse et par minute (défaut : 300). */
  limiteParMinute?: number;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: 2 * 1024,
    trustProxy: o.trustProxy ?? false,
    ajv: { customOptions: { removeAdditional: false } },
  });
  // Toutes les routes sont limitées ; enregistré avant elles.
  await app.register(rateLimit, { max: o.limiteParMinute ?? 300, timeWindow: '1 minute' });

  const gestionnaire = async (req: FastifyRequest): Promise<Utilisateur> => {
    const entete = req.headers.authorization;
    if (!entete?.startsWith('Bearer ')) throw new ErreurAuthentification();
    let u: Utilisateur;
    try {
      u = await o.verifierJeton(entete.slice('Bearer '.length));
    } catch {
      throw new ErreurAuthentification();
    }
    // Un agent IA ne crée jamais de code (ADR-0013), même si un rôle lui était attribué par erreur.
    if (!u.roles.includes(ROLE_GESTION) || u.roles.includes('agent-ia') || u.agent) {
      throw new ErreurInterdite();
    }
    return u;
  };

  app.setErrorHandler((err, _req, reply) => {
    if ((err as { statusCode?: number }).statusCode === 429) {
      return reply.code(429).send({ erreur: 'Trop de requêtes. Réessayez dans une minute.' });
    }
    if (err instanceof ErreurAuthentification) {
      return reply.code(401).send({ erreur: 'Authentification requise.' });
    }
    if (err instanceof ErreurInterdite) return reply.code(403).send({ erreur: 'Accès refusé.' });
    if (err instanceof ErreurInvitation) {
      const code = { 'cohorte-inconnue': 400, 'quota-atteint': 409, introuvable: 404 }[err.motif];
      return reply.code(code).send({ erreur: err.message, motif: err.motif });
    }
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({ erreur: 'Requête invalide.' });
    }
    o.journal.erreur('erreur interne des invitations', { err });
    return reply.code(500).send({ erreur: 'Erreur interne.' });
  });

  app.get('/sante', async () => ({ statut: 'ok' }));

  const cohorte = { type: 'string', pattern: COHORTE.source } as const;

  app.post<{ Body: { cohorte: string } }>(
    '/invitations',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['cohorte'],
          properties: { cohorte },
        },
      },
    },
    async (req, reply) => {
      const u = await gestionnaire(req);
      const invitation = await o.service.creer({ cohorte: req.body.cohorte, par: u.sujet });
      // Jamais le code : l'identifiant suffit à retrouver l'invitation.
      o.journal.info('invitation créée', {
        par: u.sujet,
        invitation: invitation.id,
        cohorte: invitation.cohorte,
      });
      return reply.code(201).header('cache-control', 'no-store').send(invitation);
    },
  );

  app.get<{ Querystring: { cohorte: string } }>(
    '/invitations',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['cohorte'],
          properties: { cohorte },
        },
      },
    },
    async (req) => {
      await gestionnaire(req);
      return { invitations: await o.service.lister(req.query.cohorte) };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/invitations/:id/revocation',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (req) => {
      const u = await gestionnaire(req);
      await o.service.revoquer(req.params.id);
      o.journal.info('invitation révoquée', { par: u.sujet, invitation: req.params.id });
      return { statut: 'revoque' };
    },
  );

  app.post<{ Body: { code: string } }>(
    '/invitations/verification',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['code'],
          properties: { code: { type: 'string', maxLength: 32 } },
        },
      },
    },
    async (req, reply) => {
      if (!o.limiteur.essayer(req.ip)) {
        o.journal.avertissement('trop d’essais de code d’invitation');
        return reply
          .code(429)
          .send({ erreur: 'Trop d’essais. Réessayez plus tard.', motif: 'trop-d-essais' });
      }
      // Même réponse pour un code inconnu, expiré, révoqué ou déjà utilisé.
      return { valide: await o.service.verifier(req.body.code) };
    },
  );

  if (o.verifierService) {
    const verifierService = o.verifierService;
    const extension = async (req: FastifyRequest): Promise<string> => {
      const entete = req.headers.authorization;
      if (!entete?.startsWith('Bearer ')) throw new ErreurAuthentification();
      try {
        return await verifierService(entete.slice('Bearer '.length));
      } catch {
        throw new ErreurAuthentification();
      }
    };
    const code = { type: 'string', maxLength: 32 } as const;

    // Contrôle avant la création du compte : les essais sont limités par adresse du navigateur,
    // transmise par Keycloak (sinon tous les patients partageraient l'adresse de Keycloak).
    app.post<{ Body: { code: string; adresse: string } }>(
      '/inscription/controle',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'adresse'],
            properties: { code, adresse: { type: 'string', minLength: 1, maxLength: 64 } },
          },
        },
      },
      async (req, reply) => {
        await extension(req);
        if (!o.limiteur.essayer(`inscription:${req.body.adresse}`)) {
          o.journal.avertissement('trop d’essais de code à l’inscription');
          return reply.code(429).send({ erreur: 'Trop d’essais.', motif: 'trop-d-essais' });
        }
        return { valide: await o.service.verifier(req.body.code) };
      },
    );

    // Utilisation atomique pour le compte créé ; 409 si le code ne peut plus servir.
    app.post<{ Body: { code: string; sujet: string } }>(
      '/inscription/utilisation',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'sujet'],
            properties: {
              code,
              sujet: { type: 'string', pattern: '^[A-Za-z0-9-]{1,64}$' },
            },
          },
        },
      },
      async (req, reply) => {
        await extension(req);
        const cohorte = await o.service.utiliser(req.body.code, req.body.sujet);
        if (!cohorte) {
          return reply.code(409).send({ erreur: 'Code non reconnu.', motif: 'code-non-reconnu' });
        }
        // Jamais le code : le compte et la cohorte suffisent.
        o.journal.info('code d’invitation utilisé', { sujet: req.body.sujet, cohorte });
        return { cohorte };
      },
    );
  }

  return app;
}
