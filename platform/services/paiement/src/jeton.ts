// Jetons de service Keycloak (flux « client credentials ») : émetteur, audience
// mbolo-paiement-api, et client appelant dans la liste autorisée.
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

export type VerifierAppelant = (jeton: string) => Promise<string>;

export function creerVerificateurAppelant(o: {
  emetteur: string;
  audience: string;
  clientsAutorises: readonly string[];
  cles?: JWTVerifyGetKey;
}): VerifierAppelant {
  const cles = o.cles ?? createRemoteJWKSet(new URL(`${o.emetteur}/protocol/openid-connect/certs`));
  return async (jeton) => {
    const { payload } = await jwtVerify<JWTPayload & { azp?: string }>(jeton, cles, {
      issuer: o.emetteur,
      audience: o.audience,
      algorithms: ['RS256', 'ES256'],
    });
    if (!payload.azp || !o.clientsAutorises.includes(payload.azp)) {
      throw new Error('Client non autorisé.');
    }
    return payload.azp;
  };
}
