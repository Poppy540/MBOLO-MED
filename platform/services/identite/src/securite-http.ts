// Durcissement HTTP commun à tous les services (revue ASVS n°1, docs/securite/asvs-matrice.md).
// - C1 : aucune réponse d'API n'est mise en cache (données personnelles ou de santé) et le navigateur
//   ne devine jamais le type d'un contenu.
// - C2 : en production, tout échange avec un autre service, Keycloak ou le dossier se fait en HTTPS.
import type { FastifyInstance } from 'fastify';

/**
 * En-têtes posés sur toutes les réponses : `X-Content-Type-Options: nosniff`, et
 * `Cache-Control: no-store` sauf si la route en a choisi un autre.
 */
export function entetesSecurite(app: FastifyInstance): void {
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
    return payload;
  });
}

export class ErreurAdresseNonChiffree extends Error {}

/**
 * En production, refuse toute adresse qui n'est pas en `https://` (ou `wss://`) ; les variables
 * absentes sont ignorées (le service vérifie lui-même ce qui est obligatoire). Hors production : rien.
 */
export function exigerHttps(
  adresses: Record<string, string | undefined>,
  production: boolean,
): void {
  if (!production) return;
  const refusees = Object.entries(adresses)
    .filter(([, v]) => v !== undefined && v !== '')
    .filter(([, v]) => {
      try {
        return !['https:', 'wss:'].includes(new URL(v ?? '').protocol);
      } catch {
        return true;
      }
    })
    .map(([nom]) => nom);
  if (refusees.length > 0) {
    // Seuls les noms des variables : jamais leur valeur (qui peut contenir un identifiant).
    throw new ErreurAdresseNonChiffree(
      `Adresses non chiffrées refusées en production : ${refusees.join(', ')}.`,
    );
  }
}
