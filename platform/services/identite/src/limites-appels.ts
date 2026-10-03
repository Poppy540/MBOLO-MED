// Limites d'appels communes aux services (revue ASVS n°3, C9, docs/securite/asvs-matrice.md).
// Au Gabon, les opérateurs mobiles partagent une même adresse IP entre de nombreux abonnés (NAT
// d'opérateur) : une limite par adresse bloquerait des patients qui ne font rien d'anormal. Les
// limites sont donc comptées par jeton de connexion (une session), et seulement par adresse pour
// les appels sans jeton. Un plafond par adresse, bien plus large, arrête une rafale qui changerait
// de jeton à chaque appel (des jetons inventés, refusés ensuite par la vérification).
import { createHash } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Clé de limite : empreinte du jeton présenté (jamais le jeton lui-même), sinon l'adresse.
 * Le jeton n'est pas vérifié ici : un jeton inventé n'obtient qu'un compteur à lui, puis un refus.
 * On ne lit pas le `sub` du jeton non vérifié : n'importe qui pourrait épuiser le compteur d'un
 * autre patient en présentant son identifiant.
 */
export function cleLimite(req: FastifyRequest): string {
  const entete = req.headers.authorization;
  if (typeof entete === 'string' && entete.startsWith('Bearer ') && entete.length > 7) {
    return `jeton:${createHash('sha256').update(entete.slice(7)).digest('hex').slice(0, 32)}`;
  }
  return `adresse:${req.ip}`;
}

export interface OptionsLimites {
  /** Appels par minute et par session (ou par adresse sans jeton), toutes routes. */
  parMinute: number;
  /** Plafond par adresse et par minute, toutes sessions confondues ; 20 × `parMinute` par défaut. */
  plafondParAdresse?: number;
}

/**
 * Enregistre les limites d'appels, avant les routes. Une route peut fixer sa propre limite
 * (`config.rateLimit`) : elle est alors comptée par session, elle aussi.
 */
export async function limiterAppels(app: FastifyInstance, o: OptionsLimites): Promise<void> {
  await app.register(rateLimit, {
    max: o.parMinute,
    timeWindow: '1 minute',
    keyGenerator: cleLimite,
  });
  const plafond = app.createRateLimit({
    max: o.plafondParAdresse ?? o.parMinute * 20,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  });
  app.addHook('onRequest', async (req, reply) => {
    const r = await plafond(req);
    if (r.isAllowed || !r.isExceeded) return;
    reply.header('retry-after', r.ttlInSeconds);
    // Même chemin qu'une limite dépassée : le gestionnaire d'erreurs du service répond 429 avec son
    // message et lève l'alerte `limite-appels`.
    throw Object.assign(new Error('Plafond d’appels par adresse atteint.'), { statusCode: 429 });
  });
}
