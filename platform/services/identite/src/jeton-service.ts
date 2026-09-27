// Jeton de service pour accéder au dossier (flux OAuth « client credentials »).
// Authentification du service auprès de Keycloak (ADR-0016) :
// - par clé privée (`private_key_jwt`, RFC 7523) : le service signe une assertion courte, à usage
//   unique ; Keycloak ne connaît que le certificat public ; aucun secret ne circule ;
// - par secret partagé (ancien mode, gardé pour la bascule).
// La clé ou le secret viennent de l'environnement (coffre-fort), jamais du dépôt.
// Le jeton est gardé en mémoire et renouvelé 30 s avant son expiration.
import { randomUUID } from 'node:crypto';
import { SignJWT, importPKCS8, type CryptoKey } from 'jose';

export type AuthentificationService =
  | { secret: string }
  /** Clé privée PKCS#8 au format PEM, ou ce PEM encodé en base64 (une seule ligne). */
  | { clePrivee: string };

export interface OptionsJetonService {
  /** Émetteur Keycloak, ex. https://auth.mbolo-sante.example/realms/mbolo */
  emetteur: string;
  client: string;
  authentification: AuthentificationService;
  fetch?: typeof fetch;
  maintenant?: () => number;
}

/** Durée de vie d'une assertion signée : courte, elle ne sert qu'à obtenir un jeton. */
const DUREE_ASSERTION_S = 60;

/** Accepte un PEM ou un PEM encodé en base64 (variable d'environnement d'une seule ligne). */
export function lirePem(valeur: string): string {
  const texte = valeur.trim();
  return texte.startsWith('-----BEGIN') ? texte : Buffer.from(texte, 'base64').toString('utf8');
}

/**
 * Authentification d'un service d'après son environnement : clé privée `<PREFIXE>_SERVICE_CLE_PRIVEE`
 * de préférence, sinon secret `<PREFIXE>_SERVICE_CLIENT_SECRET` ; `undefined` si aucune des deux.
 */
export function authentificationDepuis(
  env: Record<string, string | undefined>,
  prefixe: string,
): AuthentificationService | undefined {
  const cle = env[`${prefixe}_SERVICE_CLE_PRIVEE`];
  if (cle) return { clePrivee: cle };
  const secret = env[`${prefixe}_SERVICE_CLIENT_SECRET`];
  return secret ? { secret } : undefined;
}

export type FournisseurJeton = () => Promise<Record<string, string>>;

export class ErreurJetonService extends Error {
  constructor() {
    super('Jeton de service indisponible.');
    this.name = 'ErreurJetonService';
  }
}

export function creerFournisseurJeton(o: OptionsJetonService): FournisseurJeton {
  const appeler = o.fetch ?? fetch;
  const maintenant = o.maintenant ?? Date.now;
  const pointJeton = `${o.emetteur}/protocol/openid-connect/token`;
  let courant: { jeton: string; expireA: number } | undefined;
  let enCours: Promise<string> | undefined;
  let cle: Promise<CryptoKey> | undefined;

  /** Preuve d'identité du service : secret, ou assertion signée par sa clé privée. */
  const preuve = async (): Promise<Record<string, string>> => {
    const a = o.authentification;
    if ('secret' in a) return { client_secret: a.secret };
    cle ??= importPKCS8(lirePem(a.clePrivee), 'RS256');
    const maintenantS = Math.floor(maintenant() / 1000);
    const assertion = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(o.client)
      .setSubject(o.client)
      .setAudience(pointJeton)
      .setJti(randomUUID())
      .setIssuedAt(maintenantS)
      .setExpirationTime(maintenantS + DUREE_ASSERTION_S)
      .sign(await cle);
    return {
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
    };
  };

  const obtenir = async (): Promise<string> => {
    let r: Response;
    try {
      r = await appeler(pointJeton, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: o.client,
          ...(await preuve()),
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ErreurJetonService();
    }
    if (!r.ok) throw new ErreurJetonService();
    const corps = (await r.json()) as { access_token?: string; expires_in?: number };
    if (!corps.access_token) throw new ErreurJetonService();
    courant = {
      jeton: corps.access_token,
      expireA: maintenant() + ((corps.expires_in ?? 60) - 30) * 1000,
    };
    return corps.access_token;
  };

  return async () => {
    if (!courant || maintenant() >= courant.expireA) {
      // Une seule demande de jeton à la fois, partagée par les appels simultanés.
      enCours ??= obtenir().finally(() => {
        enCours = undefined;
      });
      await enCours;
    }
    return { authorization: `Bearer ${courant?.jeton ?? ''}` };
  };
}
