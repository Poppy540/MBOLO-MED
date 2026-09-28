// API du paiement (ADR-0017).
// - Services (jeton de service, clients autorisés) : créer le paiement d'un rendez-vous, savoir s'il
//   est payé.
// - Patient (jeton Keycloak, rôle patient, jamais un agent IA) : voir son paiement, lancer la collecte.
// - Prestataire : notifications signées, relues chez lui avant tout changement.
// Le journal ne contient jamais le numéro du payeur.
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Utilisateur, VerifierJeton } from '@mbolo/identite';
import { signalerAlerte, type Journal } from '@mbolo/journal-securise';
import { ErreurFournisseur, type FournisseurSimule } from './fournisseur.js';
import type { VerifierAppelant } from './jeton.js';
import { ErreurRecus, type ServiceRecus } from './recus.js';
import { ErreurPaiement, estAgent, type ServicePaiement } from './service.js';
import { TYPES_CONSULTATION, type TypeConsultation } from './tarifs.js';

class ErreurAuthentification extends Error {}
class ErreurInterdite extends Error {}

const REFERENCE = { type: 'string', pattern: '^[A-Za-z0-9.-]{1,64}$' } as const;
const ID = { type: 'string', format: 'uuid' } as const;

export interface Limites {
  parMinute: number;
  /** Lancement d'une collecte : chaque essai sollicite le téléphone du payeur, donc plus strict. */
  collecteParMinute: number;
}

export const LIMITES_PAR_DEFAUT: Limites = { parMinute: 300, collecteParMinute: 5 };

const STATUT_ERREUR = {
  desactive: 403,
  introuvable: 404,
  interdit: 403,
  numero: 400,
  operateur: 400,
  'deja-en-cours': 409,
  'deja-paye': 409,
  annule: 409,
  'deja-decide': 409,
} as const;

export async function creerServeur(o: {
  verifierJeton: VerifierJeton;
  verifierAppelant: VerifierAppelant;
  service: ServicePaiement;
  /** Reçus et avoirs du patient (ADR-0020) ; sans lui, la route /recus est absente. */
  recus?: ServiceRecus;
  journal: Journal;
  limites?: Limites;
  /** Derrière un proxy de confiance, l'adresse du client est lue dans X-Forwarded-For. */
  trustProxy?: boolean;
  /**
   * Développement et e2e seulement : le payeur « valide sur son téléphone » auprès du fournisseur
   * simulé. Sans elle, la route n'existe pas.
   */
  simulation?: FournisseurSimule;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: 4 * 1024,
    trustProxy: o.trustProxy ?? false,
    // Un champ inconnu est refusé, pas retiré en silence.
    ajv: { customOptions: { removeAdditional: false } },
  });
  const limites = o.limites ?? LIMITES_PAR_DEFAUT;
  // Toutes les routes sont limitées ; enregistré avant elles.
  await app.register(rateLimit, { max: limites.parMinute, timeWindow: '1 minute' });

  const jeton = (req: FastifyRequest): string => {
    const entete = req.headers.authorization;
    if (!entete?.startsWith('Bearer ')) throw new ErreurAuthentification();
    return entete.slice('Bearer '.length);
  };

  const patient = async (req: FastifyRequest): Promise<Utilisateur> => {
    let u: Utilisateur;
    try {
      u = await o.verifierJeton(jeton(req));
    } catch {
      throw new ErreurAuthentification();
    }
    // Un agent IA ne déclenche jamais un paiement (principe n°7).
    if (!u.roles.includes('patient') || estAgent(u)) throw new ErreurInterdite();
    return u;
  };

  /** Jeton d'un humain ; le rôle validation-remboursement est vérifié par le service. */
  const humain = async (req: FastifyRequest): Promise<Utilisateur> => {
    try {
      return await o.verifierJeton(jeton(req));
    } catch {
      throw new ErreurAuthentification();
    }
  };

  const appelant = async (req: FastifyRequest): Promise<string> => {
    try {
      return await o.verifierAppelant(jeton(req));
    } catch {
      throw new ErreurAuthentification();
    }
  };

  app.setErrorHandler((err, _req, reply) => {
    const statut = (err as { statusCode?: number }).statusCode;
    if (statut === 429) {
      signalerAlerte(o.journal, 'limite-appels', 'limite d’appels atteinte');
      return reply.code(429).send({ erreur: 'Trop de requêtes. Réessayez dans une minute.' });
    }
    if (err instanceof ErreurAuthentification) {
      return reply.code(401).send({ erreur: 'Authentification requise.' });
    }
    if (err instanceof ErreurInterdite) return reply.code(403).send({ erreur: 'Accès refusé.' });
    if (err instanceof ErreurRecus) {
      return reply.code(403).send({ erreur: err.message, motif: err.motif });
    }
    if (err instanceof ErreurPaiement) {
      return reply.code(STATUT_ERREUR[err.motif]).send({ erreur: err.message, motif: err.motif });
    }
    if (err instanceof ErreurFournisseur) {
      signalerAlerte(o.journal, 'erreur-serveur', 'prestataire de paiement indisponible');
      return reply
        .code(503)
        .send({ erreur: 'Paiement momentanément indisponible. Réessayez plus tard.' });
    }
    if ((err as { validation?: unknown }).validation || statut === 400 || statut === 415) {
      return reply.code(400).send({ erreur: 'Requête invalide.' });
    }
    signalerAlerte(o.journal, 'erreur-serveur', 'erreur interne du paiement', { err });
    return reply.code(500).send({ erreur: 'Erreur interne.' });
  });

  app.get('/sante', async () => ({ statut: 'ok' }));

  // ── Services ──────────────────────────────────────────────────────────────────
  app.post<{ Body: { reference: string; sujet: string; type: TypeConsultation } }>(
    '/paiements',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['reference', 'sujet', 'type'],
          properties: {
            reference: REFERENCE,
            sujet: { type: 'string', pattern: '^[A-Za-z0-9-]{1,64}$' },
            type: { type: 'string', enum: [...TYPES_CONSULTATION] },
          },
        },
      },
    },
    async (req, reply) => {
      const client = await appelant(req);
      const p = await o.service.creer(req.body);
      o.journal.info('paiement créé', { client, paiementId: p.id, statut: p.statut });
      return reply.code(201).send(p);
    },
  );

  app.get<{ Params: { reference: string } }>(
    '/rendez-vous/:reference/paiement',
    {
      schema: {
        params: { type: 'object', properties: { reference: REFERENCE }, required: ['reference'] },
      },
    },
    async (req) => {
      await appelant(req);
      return { paye: await o.service.estPaye(req.params.reference) };
    },
  );

  // Rendez-vous annulé (téléconsultation) : plus de collecte ; remboursement préparé si payé.
  app.post<{ Params: { reference: string } }>(
    '/rendez-vous/:reference/annulation',
    {
      schema: {
        params: { type: 'object', properties: { reference: REFERENCE }, required: ['reference'] },
      },
    },
    async (req) => {
      const client = await appelant(req);
      const r = await o.service.annulationRendezVous(req.params.reference);
      o.journal.info('annulation de rendez-vous reçue', { client, ...r });
      return r;
    },
  );

  // ── Valideurs des remboursements (rôle validation-remboursement) ───────────────
  app.get('/remboursements', async (req) => {
    const u = await humain(req);
    return { remboursements: await o.service.aValider(u) };
  });

  app.post<{ Params: { id: string }; Body: { decision: 'valide' | 'refuse' } }>(
    '/remboursements/:id/decision',
    {
      schema: {
        params: { type: 'object', properties: { id: ID }, required: ['id'] },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['decision'],
          // Aucun texte libre : valider ou refuser, selon les règles du porteur de projet.
          properties: { decision: { type: 'string', enum: ['valide', 'refuse'] } },
        },
      },
    },
    async (req) => {
      const u = await humain(req);
      const r = await o.service.decider(u, req.params.id, req.body.decision);
      // Qui, quel remboursement, quelle décision, quel montant ; jamais le patient ni le numéro.
      o.journal.info('décision de remboursement', {
        sujet: u.sujet,
        remboursementId: r.id,
        decision: req.body.decision,
        statut: r.statut,
        montant: r.montant,
        devise: r.devise,
      });
      return r;
    },
  );

  // ── Patient ───────────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/paiements/:id',
    { schema: { params: { type: 'object', properties: { id: ID }, required: ['id'] } } },
    async (req) => o.service.lire(await patient(req), req.params.id),
  );

  const recus = o.recus;
  if (recus) {
    // Le patient lui-même : ses reçus et avoirs (flag facturation.recus).
    app.get('/recus', async (req, reply) => {
      const liste = await recus.lister(await patient(req));
      return reply.header('cache-control', 'no-store').send({ recus: liste });
    });
  }

  app.post<{ Params: { id: string }; Body: { operateur: string; numero: string } }>(
    '/paiements/:id/collecte',
    {
      config: { rateLimit: { max: limites.collecteParMinute, timeWindow: '1 minute' } },
      schema: {
        params: { type: 'object', properties: { id: ID }, required: ['id'] },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['operateur', 'numero'],
          properties: {
            operateur: { type: 'string', pattern: '^[a-z][a-z0-9-]{1,30}$' },
            numero: { type: 'string', maxLength: 24 },
          },
        },
      },
    },
    async (req, reply) => {
      const u = await patient(req);
      try {
        const p = await o.service.collecter(u, req.params.id, req.body);
        // Qui, quel paiement, quel opérateur ; jamais le numéro.
        o.journal.info('collecte lancée', {
          sujet: u.sujet,
          paiementId: p.id,
          operateur: p.operateur,
        });
        return await reply.code(202).send(p);
      } catch (e) {
        o.journal.avertissement('collecte refusée', {
          sujet: u.sujet,
          paiementId: req.params.id,
          motif: e instanceof ErreurPaiement ? e.motif : 'prestataire',
        });
        throw e;
      }
    },
  );

  // ── Prestataire ───────────────────────────────────────────────────────────────
  // Corps lu en octets bruts : la signature porte sur les octets reçus, pas sur un JSON réécrit.
  await app.register(async (prestataire) => {
    prestataire.removeContentTypeParser('application/json');
    prestataire.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer', bodyLimit: 4 * 1024 },
      (_req, corps, fait) => fait(null, corps),
    );
    prestataire.post('/notifications/prestataire', async (req, reply) => {
      if (!Buffer.isBuffer(req.body)) return reply.code(400).send({ erreur: 'Requête invalide.' });
      const r = await o.service.notification(req.body, req.headers);
      if (!r.accepte) {
        o.journal.avertissement('notification de paiement refusée (signature invalide)');
        return reply.code(401).send({ erreur: 'Signature invalide.' });
      }
      if (r.paiement) {
        o.journal.info('notification de paiement', {
          paiementId: r.paiement.id,
          statut: r.paiement.statut,
        });
      }
      return reply.code(204).send();
    });
  });

  if (o.simulation) {
    const simule = o.simulation;
    app.post<{ Params: { id: string }; Body: { resultat: 'reussi' | 'echoue' } }>(
      '/simulation/paiements/:id/conclusion',
      {
        schema: {
          params: { type: 'object', properties: { id: ID }, required: ['id'] },
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['resultat'],
            properties: { resultat: { type: 'string', enum: ['reussi', 'echoue'] } },
          },
        },
      },
      async (req, reply) => {
        const tentative = await o.service.tentativeEnAttente(req.params.id);
        if (!tentative) return reply.code(404).send({ erreur: 'Aucune collecte en attente.' });
        // Même chemin qu'un vrai prestataire : notification signée, puis statut relu.
        const { corps, signature } = simule.conclure(tentative, req.body.resultat);
        const r = await o.service.notification(corps, { 'x-signature': signature });
        return { statut: r.paiement?.statut };
      },
    );
  }

  return app;
}
