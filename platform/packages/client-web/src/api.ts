// Appels aux API de Mbolo Santé avec le jeton de l'utilisateur ; erreurs en phrases simples.

export class ErreurApi extends Error {
  constructor(
    readonly statut: number,
    message: string,
  ) {
    super(message);
  }
}

/** Messages simples, sans jargon (faible littératie). */
const MESSAGES: Record<number, string> = {
  401: 'Votre session a expiré. Reconnectez-vous.',
  403: 'Cette fonction n’est pas encore ouverte pour votre compte.',
  404: 'Introuvable.',
  409: 'Ce n’est plus possible. Vérifiez et réessayez.',
};

export type Requete = <T>(methode: 'GET' | 'POST', chemin: string, corps?: unknown) => Promise<T>;

export function creerRequete(
  base: string,
  jeton: () => string | undefined,
  appeler: typeof fetch = fetch,
): Requete {
  return async <T>(methode: 'GET' | 'POST', chemin: string, corps?: unknown): Promise<T> => {
    const j = jeton();
    const r = await appeler(`${base}${chemin}`, {
      method: methode,
      headers: {
        ...(j ? { authorization: `Bearer ${j}` } : {}),
        ...(corps !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
    });
    if (!r.ok) {
      throw new ErreurApi(
        r.status,
        MESSAGES[r.status] ?? 'Service indisponible. Réessayez plus tard.',
      );
    }
    return (await r.json()) as T;
  };
}

export interface AccesSalle {
  url: string;
  jeton: string;
  salle: string;
}
