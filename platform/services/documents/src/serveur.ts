// API du service documents (ADR-0015). Toute requête (hors /sante) exige un jeton Keycloak valide.
// Les photos arrivent en octets bruts (image/jpeg ou image/png, 2 Mo au plus) ; leur format est
// vérifié sur le contenu. Le journal ne contient jamais d'image, de nom ni de numéro.
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { ErreurDepot, type Utilisateur, type VerifierJeton } from '@mbolo/identite';
import type { Journal } from '@mbolo/journal-securise';
import { MOTIFS_REFUS, RESULTATS, TYPES_DOCUMENT } from './depot.js';
import { TAILLE_MAX } from './format.js';
import { ErreurDocument } from './service.js';
import { ErreurVerification, type ServiceVerification } from './verification.js';
import type { DemandeDecision, ServiceVerificateur } from './verificateur.js';

const ID = { type: 'string', pattern: '^[A-Za-z0-9\\-.]{1,64}$' } as const;

class ErreurAuthentification extends Error {}

/** Limites d'appels par adresse et par minute. */
export interface Limites {
  parMinute: number;
  /** Envoi de photos : chiffrement et stockage, donc plus strict. */
  depotParMinute: number;
}

export const LIMITES_PAR_DEFAUT: Limites = { parMinute: 120, depotParMinute: 10 };

const STATUT_ERREUR_DOCUMENT = {
  format: 415,
  taille: 413,
  type: 400,
  'trop-de-documents': 409,
  introuvable: 404,
} as const;

export async function creerServeur(o: {
  verifierJeton: VerifierJeton;
  verification: ServiceVerification;
  verificateur: ServiceVerificateur;
  journal: Journal;
  limites?: Limites;
  /** Derrière un proxy de confiance, l'adresse du client est lue dans X-Forwarded-For. */
  trustProxy?: boolean;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: TAILLE_MAX,
    trustProxy: o.trustProxy ?? false,
    // Un champ inconnu est refusé, pas retiré en silence (aucun texte libre dans une décision).
    ajv: { customOptions: { removeAdditional: false } },
  });
  const limites = o.limites ?? LIMITES_PAR_DEFAUT;
  // Toutes les routes sont limitées ; enregistré avant elles.
  await app.register(rateLimit, { max: limites.parMinute, timeWindow: '1 minute' });
  // Photos en octets bruts ; tout autre type de contenu est refusé (415) par Fastify.
  app.addContentTypeParser(
    ['image/jpeg', 'image/png'],
    { parseAs: 'buffer', bodyLimit: TAILLE_MAX },
    (_req, corps, fait) => fait(null, corps),
  );

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
    const statut = (err as { statusCode?: number }).statusCode;
    if (statut === 429) {
      return reply.code(429).send({ erreur: 'Trop de requêtes. Réessayez dans une minute.' });
    }
    if (statut === 413) {
      return reply.code(413).send({ erreur: 'Photo trop lourde (2 Mo au plus).' });
    }
    if (statut === 415) {
      return reply.code(415).send({ erreur: 'Seules les photos JPEG ou PNG sont acceptées.' });
    }
    if (err instanceof ErreurVerification) {
      return reply.code(err.statut).send({ erreur: err.message });
    }
    if (err instanceof ErreurDocument) {
      return reply.code(STATUT_ERREUR_DOCUMENT[err.motif]).send({ erreur: err.message });
    }
    if (err instanceof ErreurDepot) {
      if (err.statut === 503) o.journal.erreur('dossier médical indisponible', { err });
      return reply.code(err.statut).send({ erreur: err.message });
    }
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({ erreur: 'Requête invalide.' });
    }
    o.journal.erreur('erreur interne du service documents', { err });
    return reply.code(500).send({ erreur: 'Erreur interne.' });
  });

  app.get('/sante', async () => ({ statut: 'ok' }));

  // État du parcours pour le patient : statut, charte en vigueur, photos déjà envoyées.
  app.get('/verification', async (req) => o.verification.etat(await authentifier(req)));

  app.post<{ Params: { type: string } }>(
    '/verification/documents/:type',
    {
      config: { rateLimit: { max: limites.depotParMinute, timeWindow: '1 minute' } },
      schema: {
        params: {
          type: 'object',
          properties: { type: { type: 'string', enum: [...TYPES_DOCUMENT] } },
          required: ['type'],
        },
      },
    },
    async (req, reply) => {
      const u = await authentifier(req);
      if (!Buffer.isBuffer(req.body)) {
        return reply.code(415).send({ erreur: 'Seules les photos JPEG ou PNG sont acceptées.' });
      }
      try {
        const d = await o.verification.deposer(u, req.params.type, req.body);
        // Chaque dépôt est tracé : qui, pour quel dossier, quel type, quelle taille.
        o.journal.info('photo déposée', {
          sujet: u.sujet,
          patientId: u.patientId,
          type: d.type,
          documentId: d.id,
          taille: req.body.length,
        });
        return await reply.code(201).send({ type: d.type, format: d.format });
      } catch (e) {
        o.journal.avertissement('photo refusée', {
          sujet: u.sujet,
          type: req.params.type,
          motif: e instanceof ErreurDocument ? e.motif : (e as Error).message,
        });
        throw e;
      }
    },
  );

  // ── Vérificateur (rôle verification-identite) ─────────────────────────────────
  app.get('/verifications', async (req) => {
    const u = await authentifier(req);
    const liste = await o.verificateur.aVerifier(u);
    o.journal.info('vérifications à faire consultées', { sujet: u.sujet, nombre: liste.length });
    return { verifications: liste };
  });

  app.get<{ Params: { patientId: string } }>(
    '/verifications/:patientId',
    {
      schema: {
        params: { type: 'object', properties: { patientId: ID }, required: ['patientId'] },
      },
    },
    async (req) => {
      const u = await authentifier(req);
      const fiche = await o.verificateur.fiche(u, req.params.patientId);
      o.journal.info('identité déclarée consultée', {
        sujet: u.sujet,
        patientId: req.params.patientId,
      });
      return fiche;
    },
  );

  app.get<{ Params: { patientId: string; documentId: string } }>(
    '/verifications/:patientId/documents/:documentId',
    {
      schema: {
        params: {
          type: 'object',
          properties: { patientId: ID, documentId: { type: 'string', format: 'uuid' } },
          required: ['patientId', 'documentId'],
        },
      },
    },
    async (req, reply) => {
      const u = await authentifier(req);
      const photo = await o.verificateur.photo(u, req.params.patientId, req.params.documentId);
      o.journal.info('photo d’identité consultée', {
        sujet: u.sujet,
        patientId: req.params.patientId,
        documentId: req.params.documentId,
      });
      // Jamais gardée par le navigateur ni par un intermédiaire.
      return reply
        .header('cache-control', 'no-store')
        .header('x-content-type-options', 'nosniff')
        .type(photo.format)
        .send(photo.octets);
    },
  );

  app.post<{ Params: { patientId: string }; Body: DemandeDecision }>(
    '/verifications/:patientId/decision',
    {
      schema: {
        params: { type: 'object', properties: { patientId: ID }, required: ['patientId'] },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['resultat'],
          properties: {
            resultat: { type: 'string', enum: [...RESULTATS] },
            motif: { type: 'string', enum: [...MOTIFS_REFUS] },
            identifiant: {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'valeur'],
              properties: {
                type: { type: 'string', enum: ['assurance-maladie', 'provisoire'] },
                valeur: { type: 'string', pattern: '^[A-Za-z0-9-]{3,40}$' },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const u = await authentifier(req);
      await o.verificateur.decider(u, req.params.patientId, req.body);
      // Qui, quand, quel résultat ; jamais le numéro saisi.
      o.journal.info('décision de vérification d’identité', {
        sujet: u.sujet,
        patientId: req.params.patientId,
        resultat: req.body.resultat,
        motif: req.body.motif,
      });
      return reply.code(201).send({ resultat: req.body.resultat });
    },
  );

  return app;
}
