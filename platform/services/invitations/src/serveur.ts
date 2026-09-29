// API des invitations. Création, liste et révocation : rôle gestion-invitations uniquement (humain,
// double authentification). Vérification d'un code : publique, mais limitée en nombre d'essais.
// Inscription (ADR-0014) : contrôle et utilisation d'un code par l'extension Keycloak seulement.
// Proches (ADR-0019) : le patient invite, liste et révoque ses propres invitations ; à sa demande,
// l'équipe d'assistance (rôle assistance-patient) retire tous ses proches.
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  ErreurDepot,
  type Utilisateur,
  type VerifierJeton,
  entetesSecurite,
} from '@mbolo/identite';
import {
  LIENS_PROCHE,
  PRENOM_MAX,
  TYPES_IDENTIFIANT_PATIENT,
  type LienProche,
  type TypeIdentifiantPatient,
} from '@mbolo/dossier-fhir';
import { signalerAlerte, type Journal } from '@mbolo/journal-securise';
import type { VerifierService } from './jeton-service.js';
import type { Limiteur } from './limiteur.js';
import { ErreurServiceAppele } from './adaptateurs.js';
import type { ServiceAssistance } from './assistance.js';
import { ErreurProche, type ServiceProches } from './proches.js';
import type { TypeInvitation } from './depot.js';
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
  /** Invitations de proches par le patient (ADR-0019) ; sans lui, les routes /proches sont absentes. */
  proches?: ServiceProches;
  /** Retrait des proches par l'équipe d'assistance (ADR-0019) ; sans lui, /assistance est absent. */
  assistance?: ServiceAssistance;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: 2 * 1024,
    trustProxy: o.trustProxy ?? false,
    ajv: { customOptions: { removeAdditional: false } },
  });
  // Revue ASVS n°1 (C1) : ni cache ni devinette de type sur les réponses.
  entetesSecurite(app);
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
      signalerAlerte(o.journal, 'limite-appels', 'limite d’appels atteinte');
      return reply.code(429).send({ erreur: 'Trop de requêtes. Réessayez dans une minute.' });
    }
    if (err instanceof ErreurAuthentification) {
      return reply.code(401).send({ erreur: 'Authentification requise.' });
    }
    if (err instanceof ErreurInterdite) return reply.code(403).send({ erreur: 'Accès refusé.' });
    if (err instanceof ErreurProche) {
      if (err.motif === 'trop-d-essais') {
        signalerAlerte(o.journal, 'essais-bloques', 'trop d’essais de date de naissance', {
          verification: 'naissance',
        });
      }
      return reply
        .code(err.statut)
        .send({ erreur: err.message, ...(err.motif ? { motif: err.motif } : {}) });
    }
    if (err instanceof ErreurServiceAppele) {
      if (err.statut === 403) return reply.code(403).send({ erreur: 'Accès refusé.' });
      signalerAlerte(o.journal, 'erreur-serveur', 'service appelé indisponible', { err });
      return reply.code(503).send({ erreur: err.message });
    }
    if (err instanceof ErreurDepot) {
      if (err.statut === 503)
        signalerAlerte(o.journal, 'erreur-serveur', 'dossier médical indisponible', { err });
      return reply.code(err.statut).send({ erreur: err.message });
    }
    if (err instanceof ErreurInvitation) {
      const code = { 'cohorte-inconnue': 400, 'quota-atteint': 409, introuvable: 404 }[err.motif];
      return reply.code(code).send({ erreur: err.message, motif: err.motif });
    }
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({ erreur: 'Requête invalide.' });
    }
    signalerAlerte(o.journal, 'erreur-serveur', 'erreur interne des invitations', { err });
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
      if (!(await o.limiteur.essayer(req.ip))) {
        signalerAlerte(o.journal, 'essais-bloques', 'trop d’essais de code d’invitation', {
          verification: 'code',
        });
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
    // Types de codes que l'extension sait traiter ; par défaut, patient seulement (ADR-0019).
    const types = {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { type: 'string', enum: ['patient', 'proche'] },
    } as const;

    // Contrôle avant la création du compte : les essais sont limités par adresse du navigateur,
    // transmise par Keycloak (sinon tous les patients partageraient l'adresse de Keycloak).
    app.post<{ Body: { code: string; adresse: string; types?: TypeInvitation[] } }>(
      '/inscription/controle',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'adresse'],
            properties: {
              code,
              adresse: { type: 'string', minLength: 1, maxLength: 64 },
              types,
            },
          },
        },
      },
      async (req, reply) => {
        await extension(req);
        if (!(await o.limiteur.essayer(`inscription:${req.body.adresse}`))) {
          signalerAlerte(o.journal, 'essais-bloques', 'trop d’essais de code à l’inscription', {
            verification: 'inscription',
          });
          return reply.code(429).send({ erreur: 'Trop d’essais.', motif: 'trop-d-essais' });
        }
        return { valide: await o.service.verifier(req.body.code, req.body.types) };
      },
    );

    // Utilisation atomique pour le compte créé ; 409 si le code ne peut plus servir.
    app.post<{ Body: { code: string; sujet: string; types?: TypeInvitation[] } }>(
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
              types,
            },
          },
        },
      },
      async (req, reply) => {
        await extension(req);
        const utilise = await o.service.utiliser(req.body.code, req.body.sujet, req.body.types);
        if (!utilise) {
          return reply.code(409).send({ erreur: 'Code non reconnu.', motif: 'code-non-reconnu' });
        }
        // Jamais le code : le compte, la cohorte et le type suffisent.
        o.journal.info('code d’invitation utilisé', {
          sujet: req.body.sujet,
          cohorte: utilise.cohorte,
          type: utilise.type,
        });
        return utilise;
      },
    );
  }

  const proches = o.proches;
  if (proches) {
    // Le patient connecté (jeton de l'application patient) ; le jeton sert aussi au consentement.
    const patient = async (req: FastifyRequest): Promise<{ u: Utilisateur; jeton: string }> => {
      const entete = req.headers.authorization;
      if (!entete?.startsWith('Bearer ')) throw new ErreurAuthentification();
      const jeton = entete.slice('Bearer '.length);
      try {
        return { u: await o.verifierJeton(jeton), jeton };
      } catch {
        throw new ErreurAuthentification();
      }
    };

    app.post<{
      Body: { prenom: string; lien: LienProche; telephone: string; versionTexte: string };
    }>(
      '/proches',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['prenom', 'lien', 'telephone', 'versionTexte'],
            properties: {
              prenom: { type: 'string', minLength: 1, maxLength: PRENOM_MAX },
              lien: { type: 'string', enum: [...LIENS_PROCHE] },
              // Format international (E.164) : utilisé pour le SMS, jamais gardé.
              telephone: { type: 'string', pattern: '^\\+[1-9][0-9]{7,14}$' },
              versionTexte: { type: 'string', minLength: 1, maxLength: 200 },
            },
          },
        },
      },
      async (req, reply) => {
        const { u, jeton } = await patient(req);
        const r = await proches.inviter(u, jeton, req.body);
        // Ni le prénom, ni le numéro, ni le code : l'identifiant et le résultat du SMS.
        o.journal.info('proche invité', { par: u.sujet, invitation: r.id, sms: r.sms });
        return reply.code(201).header('cache-control', 'no-store').send(r);
      },
    );

    app.get('/proches', async (req) => {
      const { u } = await patient(req);
      return { proches: await proches.lister(u) };
    });

    app.post<{ Params: { id: string } }>(
      '/proches/:id/revocation',
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
        const { u, jeton } = await patient(req);
        await proches.revoquer(u, jeton, req.params.id);
        o.journal.info('invitation de proche révoquée', {
          par: u.sujet,
          invitation: req.params.id,
        });
        return { statut: 'revoque' };
      },
    );
  }

  const assistance = o.assistance;
  if (assistance) {
    // Membre de l'équipe (espace professionnel) ; son jeton sert aussi au retrait des partages.
    const membre = async (req: FastifyRequest): Promise<{ u: Utilisateur; jeton: string }> => {
      const entete = req.headers.authorization;
      if (!entete?.startsWith('Bearer ')) throw new ErreurAuthentification();
      const jeton = entete.slice('Bearer '.length);
      try {
        return { u: await o.verifierJeton(jeton), jeton };
      } catch {
        throw new ErreurAuthentification();
      }
    };
    const patientId = { type: 'string', pattern: '^[A-Za-z0-9\\-.]{1,64}$' } as const;

    app.post<{ Body: { type: TypeIdentifiantPatient; numero: string } }>(
      '/assistance/recherche',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'numero'],
            properties: {
              type: { type: 'string', enum: [...TYPES_IDENTIFIANT_PATIENT] },
              numero: { type: 'string', pattern: '^[A-Za-z0-9\\-]{1,64}$' },
            },
          },
        },
      },
      async (req, reply) => {
        const { u } = await membre(req);
        const fiche = await assistance.rechercher(u, req.body);
        // Ni le numéro recherché ni le téléphone : le dossier trouvé et le nombre de proches.
        o.journal.info('assistance : dossier retrouvé', {
          par: u.sujet,
          patientId: fiche.patientId,
          proches: fiche.proches,
        });
        return reply.header('cache-control', 'no-store').send(fiche);
      },
    );

    app.post<{ Body: { patientId: string; naissance: string; rappel: true } }>(
      '/assistance/retrait-proches',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['patientId', 'naissance', 'rappel'],
            properties: {
              patientId,
              naissance: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
              // Le membre de l'équipe confirme avoir rappelé le patient au numéro du dossier.
              rappel: { type: 'boolean', const: true },
            },
          },
        },
      },
      async (req) => {
        const { u, jeton } = await membre(req);
        const r = await assistance.retirerProches(u, jeton, req.body);
        o.journal.avertissement('proches retirés par l’équipe d’assistance', {
          par: u.sujet,
          patientId: req.body.patientId,
          retires: r.retires,
          sms: r.sms,
        });
        return r;
      },
    );

    // Récupération du compte d'un patient sans e-mail (ADR-0021) : code montré une seule fois au
    // membre de l'équipe, qui le dicte pendant l'appel au numéro du dossier.
    app.post<{
      Body: {
        patientId: string;
        naissance: string;
        type: TypeIdentifiantPatient;
        numero: string;
        rappel: true;
      };
    }>(
      '/assistance/recuperation',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['patientId', 'naissance', 'type', 'numero', 'rappel'],
            properties: {
              patientId,
              naissance: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
              type: { type: 'string', enum: [...TYPES_IDENTIFIANT_PATIENT] },
              numero: { type: 'string', pattern: '^[A-Za-z0-9\\-]{1,64}$' },
              rappel: { type: 'boolean', const: true },
            },
          },
        },
      },
      async (req, reply) => {
        const { u } = await membre(req);
        const r = await assistance.creerCodeRecuperation(u, req.body);
        // Jamais le code ni le numéro : qui, pour quel dossier, jusqu'à quand.
        o.journal.avertissement('code de récupération remis par l’équipe d’assistance', {
          par: u.sujet,
          patientId: req.body.patientId,
          expireLe: r.expireLe,
        });
        return reply.code(201).header('cache-control', 'no-store').send(r);
      },
    );

    if (o.verifierService) {
      const verifierService = o.verifierService;
      // Extension Keycloak (flux « identifiants oubliés ») : le compte et son dossier viennent de
      // Keycloak, jamais du formulaire. Essais limités par adresse du navigateur.
      app.post<{ Body: { code: string; sujet: string; patientId: string; adresse: string } }>(
        '/recuperation/utilisation',
        {
          schema: {
            body: {
              type: 'object',
              additionalProperties: false,
              required: ['code', 'sujet', 'patientId', 'adresse'],
              properties: {
                code: { type: 'string', maxLength: 32 },
                sujet: { type: 'string', pattern: '^[A-Za-z0-9-]{1,64}$' },
                patientId,
                adresse: { type: 'string', minLength: 1, maxLength: 64 },
              },
            },
          },
        },
        async (req, reply) => {
          const entete = req.headers.authorization;
          if (!entete?.startsWith('Bearer ')) throw new ErreurAuthentification();
          try {
            await verifierService(entete.slice('Bearer '.length));
          } catch {
            throw new ErreurAuthentification();
          }
          if (!(await o.limiteur.essayer(`recuperation:${req.body.adresse}`))) {
            signalerAlerte(o.journal, 'essais-bloques', 'trop d’essais de code de récupération', {
              verification: 'recuperation',
            });
            return reply.code(429).send({ erreur: 'Trop d’essais.', motif: 'trop-d-essais' });
          }
          const r = await assistance.utiliserCodeRecuperation(req.body);
          if (!r.utilise) {
            return reply.code(409).send({ erreur: 'Code non reconnu.', motif: 'code-non-reconnu' });
          }
          o.journal.avertissement('code de récupération utilisé', {
            sujet: req.body.sujet,
            patientId: req.body.patientId,
            sms: r.sms,
          });
          return { utilise: true };
        },
      );
    }
  }

  return app;
}
