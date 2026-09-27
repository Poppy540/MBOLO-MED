// Jetons de service présentés par l'extension Keycloak d'inscription (ADR-0014) : émetteur, audience
// mbolo-invitations-api, et client (azp) dans la liste autorisée. Un jeton d'utilisateur est refusé.
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

export type VerifierService = (jeton: string) => Promise<string>;

export function creerVerificateurService(o: {
  emetteur: string;
  audience: string;
  clientsAutorises: readonly string[];
  cles?: JWTVerifyGetKey;
}): VerifierService {
  const cles = o.cles ?? createRemoteJWKSet(new URL(`${o.emetteur}/protocol/openid-connect/certs`));
  return async (jeton) => {
    const { payload } = await jwtVerify<JWTPayload & { azp?: string }>(jeton, cles, {
      issuer: o.emetteur,
      audience: o.audience,
      algorithms: ['RS256', 'ES256'],
      // Jetons de 60 s produits par Keycloak lui-même : pas de marge au-delà de 30 s.
      clockTolerance: 30,
    });
    if (!payload.azp || !o.clientsAutorises.includes(payload.azp)) {
      throw new Error('Client non autorisé.');
    }
    return payload.azp;
  };
}
