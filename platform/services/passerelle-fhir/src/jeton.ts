// Vérification des jetons de service émis par Keycloak (flux « client credentials »).
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import {
  lireElements,
  lirePermissions,
  type ElementsAutorises,
  type Permissions,
} from './permissions.js';

export interface ClientService {
  /** Identifiant du client Keycloak (ex. mbolo-identite-service). */
  client: string;
  permissions: Permissions;
  /** Éléments lisibles par type (revendication mbolo_elements) ; vide : aucune restriction. */
  elements: ElementsAutorises;
  /**
   * Éléments modifiables par type (revendication mbolo_elements_modifiables), pour un type restreint :
   * une mise à jour ne remplace que ceux-là, le reste de la ressource est conservé.
   */
  modifiables: ElementsAutorises;
}

export type VerifierJeton = (jeton: string) => Promise<ClientService>;

interface Revendications extends JWTPayload {
  azp?: string;
  /**
   * Permissions SMART du client. Portées par une revendication dédiée : le royaume ne déclare pas
   * de portées OAuth personnalisées (leur import supprimerait les portées par défaut de Keycloak).
   */
  mbolo_scopes?: string;
  /** Éléments autorisés par type, ex. « Patient.telecom » (minimisation, ADR-0012). */
  mbolo_elements?: string;
  /** Éléments modifiables par type, ex. « Patient.extension » (ADR-0015). */
  mbolo_elements_modifiables?: string;
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
    return {
      client: payload.azp,
      permissions: lirePermissions(payload.mbolo_scopes),
      elements: lireElements(payload.mbolo_elements),
      modifiables: lireElements(payload.mbolo_elements_modifiables),
    };
  };
}
