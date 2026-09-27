// Jeton de service du service identité pour accéder au dossier (flux OAuth « client credentials »).
// Le secret vient de l'environnement (coffre-fort en recette et production), jamais du dépôt.
// Le jeton est gardé en mémoire et renouvelé 30 s avant son expiration.

export interface OptionsJetonService {
  /** Émetteur Keycloak, ex. https://auth.mbolo-sante.example/realms/mbolo */
  emetteur: string;
  client: string;
  secret: string;
  fetch?: typeof fetch;
  maintenant?: () => number;
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
  let courant: { jeton: string; expireA: number } | undefined;
  let enCours: Promise<string> | undefined;

  const obtenir = async (): Promise<string> => {
    let r: Response;
    try {
      r = await appeler(`${o.emetteur}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: o.client,
          client_secret: o.secret,
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
