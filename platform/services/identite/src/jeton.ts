// Vérification des jetons d'accès émis par Keycloak (OpenID Connect) et conversion en Utilisateur.
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { estRole, type Utilisateur } from './roles.js';

export interface OptionsJeton {
  /** Émetteur attendu, ex. https://auth.mbolo-sante.example/realms/mbolo */
  emetteur: string;
  /** Audience attendue (client Keycloak de l'API). */
  audience: string;
  /** Clés de vérification ; par défaut, le JWKS publié par l'émetteur. */
  cles?: JWTVerifyGetKey;
}

export type VerifierJeton = (jeton: string) => Promise<Utilisateur>;

interface RevendicationsMbolo extends JWTPayload {
  realm_access?: { roles?: string[] };
  patient_id?: string;
  practitioner_id?: string;
  related_person_id?: string;
  agent_nom?: string;
  agent_patient_session?: string;
  acr?: unknown;
}

export function creerVerificateur(o: OptionsJeton): VerifierJeton {
  const cles = o.cles ?? createRemoteJWKSet(new URL(`${o.emetteur}/protocol/openid-connect/certs`));
  return async (jeton) => {
    const { payload } = await jwtVerify<RevendicationsMbolo>(jeton, cles, {
      issuer: o.emetteur,
      audience: o.audience,
      algorithms: ['RS256', 'ES256'],
    });
    if (!payload.sub) throw new Error('Jeton sans sujet.');
    const roles = (payload.realm_access?.roles ?? []).filter(estRole);
    // Niveau d'authentification (ADR-0022) : seuls les entiers attendus sont retenus.
    const niveau =
      typeof payload.acr === 'string' && /^[1-9]$/.test(payload.acr)
        ? Number(payload.acr)
        : undefined;
    return {
      sujet: payload.sub,
      roles,
      ...(payload.patient_id ? { patientId: payload.patient_id } : {}),
      ...(payload.practitioner_id ? { practitionerId: payload.practitioner_id } : {}),
      ...(payload.related_person_id ? { relatedPersonId: payload.related_person_id } : {}),
      ...(niveau ? { niveau } : {}),
      ...(payload.agent_nom && payload.agent_patient_session
        ? { agent: { nom: payload.agent_nom, patientSession: payload.agent_patient_session } }
        : {}),
    };
  };
}

/** Client Keycloak appelant (revendication `azp`), pour les routes réservées à un service. */
export type VerifierAppelant = (jeton: string) => Promise<string>;

/**
 * Jeton de service (flux « client credentials », ou jeton signé par le royaume pour l'extension
 * Keycloak) : émetteur, audience, et client appelant dans la liste autorisée.
 */
export function creerVerificateurAppelant(
  o: OptionsJeton & { clientsAutorises: readonly string[] },
): VerifierAppelant {
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
