// API de consultation clinique. Toute requête (hors /sante) exige un jeton Keycloak valide ; le
// même jeton est présenté au service identite pour la décision d'accès au dossier.
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  ErreurDepot,
  type Utilisateur,
  type VerifierJeton,
  entetesSecurite,
  limiterAppels,
} from '@mbolo/identite';
import { signalerAlerte, type Journal } from '@mbolo/journal-securise';
import { ErreurDecision } from './acces.js';
import {
  ErreurConsultation,
  LIGNES_MAX,
  type LigneSaisie,
  type ServiceConsultation,
} from './service.js';

class ErreurAuthentification extends Error {}

const ID = { type: 'string', pattern: '^[A-Za-z0-9\\-.]{1,64}$' } as const;
const TEXTE = { type: 'string', maxLength: 4000 } as const;
const NUMERO = { type: 'string', pattern: '^ORD-[0-9A-F]{12}$' } as const;
const CODE = {
  type: 'object',
  additionalProperties: false,
  required: ['systeme', 'code', 'libelle'],
  properties: {
    systeme: { type: 'string', format: 'uri', maxLength: 200 },
    code: { type: 'string', pattern: '^[A-Za-z0-9.-]{1,40}$' },
    libelle: { type: 'string', minLength: 1, maxLength: 120 },
  },
} as const;
/** Ligne d'ordonnance structurée : aucun champ de texte libre (ADR-0018, mbolo-ord-1). */
const LIGNE = {
  type: 'object',
  additionalProperties: false,
  required: ['medicament', 'dose', 'frequence', 'dureeJours'],
  properties: {
    medicament: CODE,
    dose: {
      type: 'object',
      additionalProperties: false,
      required: ['valeur', 'unite'],
      properties: {
        valeur: { type: 'number', exclusiveMinimum: 0, maximum: 100000 },
        // Unité UCUM (ex. mg, mL, g, [iU]).
        unite: { type: 'string', pattern: '^[A-Za-z0-9%\\[\\]/.]{1,20}$' },
      },
    },
    frequence: {
      type: 'object',
      additionalProperties: false,
      required: ['fois', 'periode', 'unite'],
      properties: {
        fois: { type: 'integer', minimum: 1, maximum: 24 },
        periode: { type: 'integer', minimum: 1, maximum: 30 },
        unite: { type: 'string', enum: ['h', 'd', 'wk'] },
      },
    },
    dureeJours: { type: 'integer', minimum: 1, maximum: 365 },
    voie: CODE,
  },
} as const;

export async function creerServeur(o: {
  verifierJeton: VerifierJeton;
  service: ServiceConsultation;
  journal: Journal;
  /** Appels permis par adresse et par minute (défaut : 300). */
  limiteParMinute?: number;
  /** Derrière un proxy de confiance, l'adresse du client est lue dans X-Forwarded-For (limites d'appels). */
  trustProxy?: boolean;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: o.trustProxy ?? false,
    bodyLimit: 32 * 1024,
    // Un champ inconnu est refusé, pas silencieusement retiré.
    ajv: { customOptions: { removeAdditional: false } },
  });
  // Revue ASVS n°1 (C1) : ni cache ni devinette de type sur les réponses.
  entetesSecurite(app);
  // Toutes les routes sont limitées ; enregistré avant elles.
  await limiterAppels(app, { parMinute: o.limiteParMinute ?? 300 });

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
    if ((err as { statusCode?: number }).statusCode === 429) {
      signalerAlerte(o.journal, 'limite-appels', 'limite d’appels atteinte');
      return reply.code(429).send({ erreur: 'Trop de requêtes. Réessayez dans une minute.' });
    }
    if (err instanceof ErreurAuthentification) {
      return reply.code(401).send({ erreur: 'Authentification requise.' });
    }
    if (err instanceof ErreurConsultation) {
      return reply
        .code(err.statut)
        .send({ erreur: err.message, ...(err.motif ? { motif: err.motif } : {}) });
    }
    if (err instanceof ErreurDecision) {
      signalerAlerte(o.journal, 'erreur-serveur', 'décision d’accès indisponible');
      return reply.code(503).send({ erreur: 'Service momentanément indisponible.' });
    }
    if (err instanceof ErreurDepot) {
      if (err.statut === 503)
        signalerAlerte(o.journal, 'erreur-serveur', 'dossier médical indisponible', { err });
      return reply.code(err.statut).send({ erreur: err.message });
    }
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({ erreur: 'Requête invalide.' });
    }
    signalerAlerte(o.journal, 'erreur-serveur', 'erreur interne de la consultation', { err });
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

  // Le patient lui-même : ses comptes-rendus et ses ordonnances (lecture tracée par identite).
  app.get('/mes-documents', async (req) => {
    const { utilisateur, jeton } = await authentifier(req);
    const d = await o.service.mesDocuments(utilisateur, jeton);
    // Jamais de contenu médical dans le journal : seulement les nombres.
    o.journal.info('documents consultés par le patient', {
      sujet: utilisateur.sujet,
      comptesRendus: d.comptesRendus.length,
      ordonnances: d.ordonnances.length,
    });
    return d;
  });

  // Un proche désigné par le patient (C-PROCHE) : ordonnances et « conduite à tenir » seulement.
  app.get('/proche/documents', async (req) => {
    const { utilisateur, jeton } = await authentifier(req);
    const d = await o.service.documentsPourUnProche(utilisateur, jeton);
    o.journal.info('documents consultés par un proche', {
      sujet: utilisateur.sujet,
      comptesRendus: d.comptesRendus.length,
      ordonnances: d.ordonnances.length,
    });
    return d;
  });

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

  // ── Ordonnances électroniques (ADR-0018, flag ordonnances.electroniques) ────────
  app.post<{ Params: { id: string }; Body: { lignes: LigneSaisie[]; renouvellements?: number } }>(
    '/rendez-vous/:id/ordonnance',
    {
      schema: {
        params: { type: 'object', properties: { id: ID }, required: ['id'] },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['lignes'],
          properties: {
            lignes: { type: 'array', minItems: 1, maxItems: LIGNES_MAX, items: LIGNE },
            renouvellements: { type: 'integer', minimum: 0, maximum: 12 },
          },
        },
      },
    },
    async (req, reply) => {
      const { utilisateur, jeton } = await authentifier(req);
      const ord = await o.service.prescrire(utilisateur, jeton, req.params.id, req.body);
      // Jamais le nom d'un médicament dans le journal (donnée de santé).
      o.journal.info('ordonnance prescrite', {
        sujet: utilisateur.sujet,
        numero: ord.numero,
        lignes: ord.lignes.length,
      });
      return reply.code(201).send(ord);
    },
  );

  app.get<{ Params: { numero: string } }>(
    '/ordonnances/:numero',
    {
      schema: { params: { type: 'object', properties: { numero: NUMERO }, required: ['numero'] } },
    },
    async (req) => {
      const { utilisateur } = await authentifier(req);
      return o.service.lireOrdonnance(utilisateur, req.params.numero);
    },
  );

  app.post<{ Params: { numero: string } }>(
    '/ordonnances/:numero/revocation',
    {
      schema: { params: { type: 'object', properties: { numero: NUMERO }, required: ['numero'] } },
    },
    async (req) => {
      const { utilisateur, jeton } = await authentifier(req);
      const ord = await o.service.revoquerOrdonnance(utilisateur, jeton, req.params.numero);
      o.journal.info('ordonnance révoquée', { sujet: utilisateur.sujet, numero: ord.numero });
      return ord;
    },
  );

  return app;
}
