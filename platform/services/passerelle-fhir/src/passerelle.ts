// Passerelle du dossier médical : seul chemin vers le serveur FHIR (HAPI), qui n'est jamais exposé.
// Pour chaque requête : jeton de service valide, permission SMART pour le type et l'interaction,
// validation des écritures par les règles Mbolo, journal d'accès sans contenu médical.
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { Bundle, FhirResource } from 'fhir/r4.js';
import { valider, type Environnement } from '@mbolo/dossier-fhir';
import { signalerAlerte, type Journal } from '@mbolo/journal-securise';
import type { ClientService, VerifierJeton } from './jeton.js';
import { autorise, restreindre, type Interaction } from './permissions.js';

export interface OptionsPasserelle {
  verifierJeton: VerifierJeton;
  /** URL du serveur FHIR interne, ex. http://127.0.0.1:8080/fhir */
  amont: string;
  /** URL publique de la passerelle (pour réécrire les liens), ex. http://127.0.0.1:3002/fhir */
  publique: string;
  env: Environnement;
  journal: Journal;
  fetch?: typeof fetch;
  /**
   * Appels permis par adresse et par minute (défaut : 3000) : les services appellent la passerelle
   * pour chaque accès au dossier, la limite protège le serveur FHIR d'un service emballé.
   */
  limiteParMinute?: number;
}

const TYPE = /^[A-Z][A-Za-z]{1,63}$/;
const ID = /^[A-Za-z0-9\-.]{1,64}$/;
const TYPE_FHIR = 'application/fhir+json';
/** Paramètres qui ramèneraient d'autres types de ressources que celui autorisé. */
const PARAMETRES_INTERDITS = /^(_include|_revinclude|_has|_contained|_containedType)(:|$)/;
const ENTETES_TRANSMIS = ['if-match', 'prefer', 'cache-control'] as const;
/** Traces : jamais modifiées, quelles que soient les permissions (journal immuable). */
const TYPES_IMMUABLES = new Set(['AuditEvent', 'Provenance']);

class Refus extends Error {
  constructor(
    readonly statut: 400 | 401 | 403 | 404 | 422,
    message: string,
    readonly regles?: string[],
  ) {
    super(message);
  }
}

export async function creerPasserelle(o: OptionsPasserelle): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });
  // Toutes les routes sont limitées ; enregistré avant elles.
  await app.register(rateLimit, { max: o.limiteParMinute ?? 3000, timeWindow: '1 minute' });
  const amont = sansBarreFinale(o.amont);
  const publique = sansBarreFinale(o.publique);
  const appeler = o.fetch ?? fetch;

  app.addContentTypeParser(
    ['application/fhir+json', 'application/json'],
    { parseAs: 'string' },
    (_req, corps, fait) => {
      try {
        fait(null, JSON.parse(String(corps)));
      } catch {
        fait(new Refus(400, 'Corps JSON invalide.'), undefined);
      }
    },
  );

  const authentifier = async (req: FastifyRequest): Promise<ClientService> => {
    const entete = req.headers.authorization;
    if (!entete?.startsWith('Bearer ')) throw new Refus(401, 'Authentification requise.');
    try {
      return await o.verifierJeton(entete.slice('Bearer '.length));
    } catch {
      throw new Refus(401, 'Authentification requise.');
    }
  };

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof Refus) {
      return reply.code(err.statut).type(TYPE_FHIR).send(issue(err.message, err.regles));
    }
    if ((err as { statusCode?: number }).statusCode === 429) {
      signalerAlerte(o.journal, 'limite-appels', 'limite d’appels atteinte');
      return reply
        .code(429)
        .type(TYPE_FHIR)
        .send(issue('Trop de requêtes. Réessayez dans une minute.'));
    }
    if ((err as { statusCode?: number }).statusCode === 413) {
      return reply.code(413).type(TYPE_FHIR).send(issue('Ressource trop volumineuse.'));
    }
    signalerAlerte(o.journal, 'erreur-serveur', 'erreur interne de la passerelle', { err });
    return reply.code(502).type(TYPE_FHIR).send(issue('Dossier médical indisponible.'));
  });

  /** Réécrit les adresses du serveur interne vers l'adresse publique de la passerelle. */
  const reecrire = (texte: string): string => texte.split(amont).join(publique);

  const relayer = async (
    req: FastifyRequest,
    reply: FastifyReply,
    c: ClientService,
    interaction: Interaction,
    type: string,
    chemin: string,
    corps?: unknown,
    entetesImposes: Record<string, string> = {},
  ) => {
    const entetes: Record<string, string> = { accept: TYPE_FHIR };
    for (const nom of ENTETES_TRANSMIS) {
      const v = req.headers[nom];
      if (typeof v === 'string') entetes[nom] = v;
    }
    Object.assign(entetes, entetesImposes);
    if (corps !== undefined) entetes['content-type'] = TYPE_FHIR;
    let r: Response;
    try {
      r = await appeler(`${amont}${chemin}`, {
        method: req.method,
        headers: entetes,
        ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      signalerAlerte(o.journal, 'erreur-serveur', 'serveur FHIR injoignable', {
        client: c.client,
        type,
        interaction,
      });
      return reply.code(502).type(TYPE_FHIR).send(issue('Dossier médical indisponible.'));
    }
    let texte = await r.text();
    // Une recherche ne peut rendre que des ressources que le client a le droit de lire.
    if (r.ok && texte) {
      const reponse = JSON.parse(texte) as FhirResource;
      if (reponse.resourceType === 'Bundle') {
        const horsPerimetre = ((reponse as Bundle).entry ?? []).some(
          (e) => e.resource && !autorise(c.permissions, e.resource.resourceType, 's'),
        );
        if (horsPerimetre) throw new Refus(403, 'Résultat hors du périmètre autorisé.');
      }
      // Minimisation : seuls les éléments autorisés au client sortent de la passerelle, quels que
      // soient les paramètres de la requête (_elements n'est qu'une économie de transfert).
      if (c.elements.size > 0) {
        const filtre =
          reponse.resourceType === 'Bundle'
            ? {
                ...reponse,
                entry: (reponse.entry ?? []).map((e) =>
                  e.resource ? { ...e, resource: restreindre(e.resource, c.elements) } : e,
                ),
              }
            : restreindre(reponse, c.elements);
        texte = JSON.stringify(filtre);
      }
    }
    o.journal.info('accès au dossier', {
      client: c.client,
      interaction,
      type,
      statut: r.status,
    });
    const location = r.headers.get('location') ?? r.headers.get('content-location');
    if (location) reply.header('location', reecrire(location));
    const etag = r.headers.get('etag');
    if (etag) reply.header('etag', etag);
    return reply.code(r.status).type(TYPE_FHIR).send(reecrire(texte));
  };

  const verifierType = (type: string, id?: string) => {
    if (!TYPE.test(type) || (id !== undefined && !ID.test(id))) {
      throw new Refus(404, 'Ressource inconnue.');
    }
  };

  const exiger = (c: ClientService, type: string, interaction: Interaction) => {
    if (!autorise(c.permissions, type, interaction)) {
      signalerAlerte(o.journal, 'acces-refuse', 'accès au dossier refusé', {
        client: c.client,
        type,
        interaction,
      });
      throw new Refus(403, 'Accès refusé.');
    }
  };

  const verifierEcriture = (type: string, id: string | undefined, corps: unknown) => {
    const r = corps as FhirResource | undefined;
    if (!r || typeof r !== 'object' || r.resourceType !== type || (id && r.id !== id)) {
      throw new Refus(400, 'La ressource ne correspond pas à l’adresse.');
    }
    const violations = valider(r, o.env);
    if (violations.length > 0) {
      throw new Refus(
        422,
        'Ressource refusée par les règles du dossier.',
        violations.map((v) => v.regle),
      );
    }
  };

  /** Ressource actuelle dont seuls les éléments modifiables présents dans `corps` sont remplacés. */
  const fusionner = async (
    c: ClientService,
    type: string,
    id: string,
    corps: unknown,
  ): Promise<{ fusion: FhirResource; version: string }> => {
    const modifiables = c.modifiables.get(type);
    const envoye = corps as Record<string, unknown> | undefined;
    if (!modifiables) {
      o.journal.avertissement('modification refusée (aucun élément modifiable)', {
        client: c.client,
        type,
      });
      throw new Refus(403, 'Accès refusé.');
    }
    if (
      !envoye ||
      typeof envoye !== 'object' ||
      envoye['resourceType'] !== type ||
      envoye['id'] !== id
    ) {
      throw new Refus(400, 'La ressource ne correspond pas à l’adresse.');
    }
    const interdits = Object.keys(envoye).filter(
      (k) => !['resourceType', 'id', 'meta'].includes(k) && !modifiables.has(k),
    );
    if (interdits.length > 0) {
      o.journal.avertissement('modification d’éléments non autorisés refusée', {
        client: c.client,
        type,
        elements: interdits,
      });
      throw new Refus(403, 'Élément non modifiable.');
    }
    let r: Response;
    try {
      r = await appeler(`${amont}/${type}/${id}`, {
        headers: { accept: TYPE_FHIR, 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error('serveur FHIR injoignable');
    }
    if (r.status === 404 || r.status === 410) throw new Refus(404, 'Ressource inconnue.');
    if (!r.ok) throw new Error(`lecture avant modification impossible (${r.status})`);
    const actuel = (await r.json()) as FhirResource & Record<string, unknown>;
    const fusion: Record<string, unknown> = { ...actuel };
    for (const k of modifiables) if (k in envoye) fusion[k] = envoye[k];
    return { fusion: fusion as unknown as FhirResource, version: actuel.meta?.versionId ?? '' };
  };

  app.get('/sante', async () => ({ statut: 'ok' }));

  app.get<{ Params: { type: string }; Querystring: Record<string, string> }>(
    '/fhir/:type',
    async (req, reply) => {
      const c = await authentifier(req);
      verifierType(req.params.type);
      exiger(c, req.params.type, 's');
      const requete = new URL(req.url, 'http://passerelle').searchParams;
      for (const nom of requete.keys()) {
        if (PARAMETRES_INTERDITS.test(nom) || nom.includes('.')) {
          throw new Refus(403, 'Paramètre de recherche non autorisé.');
        }
      }
      const elements = c.elements.get(req.params.type);
      if (elements) requete.set('_elements', [...elements].join(','));
      const qs = requete.toString();
      return relayer(
        req,
        reply,
        c,
        's',
        req.params.type,
        `/${req.params.type}${qs ? `?${qs}` : ''}`,
      );
    },
  );

  // Pages suivantes d'une recherche : autorisées, le contenu est filtré par relayer().
  app.get<{ Querystring: Record<string, string> }>('/fhir', async (req, reply) => {
    const c = await authentifier(req);
    const requete = new URL(req.url, 'http://passerelle').searchParams;
    const page = requete.get('_getpages');
    if (
      !page ||
      [...requete.keys()].some(
        (k) => !['_getpages', '_getpagesoffset', '_count', '_pretty', '_bundletype'].includes(k),
      )
    ) {
      throw new Refus(404, 'Ressource inconnue.');
    }
    return relayer(req, reply, c, 's', 'Bundle', `?${requete.toString()}`);
  });

  app.get<{ Params: { type: string; id: string } }>('/fhir/:type/:id', async (req, reply) => {
    const c = await authentifier(req);
    verifierType(req.params.type, req.params.id);
    exiger(c, req.params.type, 'r');
    const elements = c.elements.get(req.params.type);
    const qs = elements ? `?_elements=${encodeURIComponent([...elements].join(','))}` : '';
    return relayer(
      req,
      reply,
      c,
      'r',
      req.params.type,
      `/${req.params.type}/${req.params.id}${qs}`,
    );
  });

  app.post<{ Params: { type: string } }>('/fhir/:type', async (req, reply) => {
    const c = await authentifier(req);
    verifierType(req.params.type);
    exiger(c, req.params.type, 'c');
    verifierEcriture(req.params.type, undefined, req.body);
    return relayer(req, reply, c, 'c', req.params.type, `/${req.params.type}`, req.body);
  });

  app.put<{ Params: { type: string; id: string } }>('/fhir/:type/:id', async (req, reply) => {
    const c = await authentifier(req);
    verifierType(req.params.type, req.params.id);
    if (TYPES_IMMUABLES.has(req.params.type)) {
      o.journal.avertissement('modification d’une trace refusée', {
        client: c.client,
        type: req.params.type,
      });
      throw new Refus(403, 'Une trace ne peut pas être modifiée.');
    }
    exiger(c, req.params.type, 'u');
    // Type restreint en lecture : seuls les éléments modifiables du client sont remplacés, le reste
    // de la ressource actuelle est conservé (le client ne l'a jamais vu).
    if (c.elements.has(req.params.type)) {
      const { fusion, version } = await fusionner(c, req.params.type, req.params.id, req.body);
      verifierEcriture(req.params.type, req.params.id, fusion);
      return relayer(
        req,
        reply,
        c,
        'u',
        req.params.type,
        `/${req.params.type}/${req.params.id}`,
        fusion,
        // Verrou optimiste : la version lue, sauf si le client en impose une.
        typeof req.headers['if-match'] === 'string' || !version
          ? {}
          : { 'if-match': `W/"${version}"` },
      );
    }
    verifierEcriture(req.params.type, req.params.id, req.body);
    return relayer(
      req,
      reply,
      c,
      'u',
      req.params.type,
      `/${req.params.type}/${req.params.id}`,
      req.body,
    );
  });

  // Tout le reste (DELETE, $opérations, _history, transactions…) est refusé : route inconnue.
  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).type(TYPE_FHIR).send(issue('Ressource inconnue.')),
  );

  return app;
}

/** Retire les « / » finaux, en temps linéaire (pas d'expression régulière sur une adresse fournie). */
export function sansBarreFinale(url: string): string {
  let fin = url.length;
  while (fin > 0 && url.charCodeAt(fin - 1) === 47) fin -= 1;
  return url.slice(0, fin);
}

function issue(message: string, regles?: string[]) {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'error',
        code: 'processing',
        diagnostics: regles?.length ? `${message} (${regles.join(', ')})` : message,
      },
    ],
  };
}
