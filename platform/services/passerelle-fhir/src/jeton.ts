// Vérification des jetons de service émis par Keycloak (flux « client credentials »).
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { lirePermissions, type Permissions } from './permissions.js';

export interface ClientService {
  /** Identifiant du client Keycloak (ex. mbolo-identite-service). */
  client: string;
  permissions: Permissions;
}

export type VerifierJeton = (jeton: string) => Promise<ClientService>;

interface Revendications extends JWTPayload {
  azp?: string;
  /**
   * Permissions SMART du client. Portées par une revendication dédiée : le royaume ne déclare pas
   * de portées OAuth personnalisées (leur import supprimerait les portées par défaut de Keycloak).
   */
  mbolo_scopes?: string;
}

export function creerVerificateur(o: {
  emetteur: string;
  audience: string;
  cles?: JWTVerifyGetKey;
}): VerifierJeton {
  const cles = o.cles ?? createRemoteJWKSet(new URL(`${o.emetteur}/protocol/openid-connect/certs`));
  return async (jeton) => {
    const { payload } = await jwtVerify<Revendications>(jeton, cles, {
      issuer: o.emetteur,
      audience: o.audience,
      algorithms: ['RS256', 'ES256'],
    });
    if (!payload.azp) throw new Error('Jeton sans client.');
    return { client: payload.azp, permissions: lirePermissions(payload.mbolo_scopes) };
  };
}
