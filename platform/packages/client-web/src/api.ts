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

/**
 * Statut des erreurs de réseau (aucune réponse du serveur) : réseau absent ou trop lent. Le
 * mode hors ligne (`estHorsLigne`) s'appuie dessus.
 */
export const STATUT_RESEAU = 0;

/** Au-delà, la requête est abandonnée : sur un réseau 3G saturé, mieux vaut le dire que d'attendre. */
export const DELAI_REQUETE_MS = 20_000;

const SANS_RESEAU = 'Pas de réseau. Vérifiez votre connexion, puis réessayez.';
const TROP_LENT = 'Le réseau est trop lent. Réessayez dans un moment.';
// Un envoi parti sans réponse a pu être enregistré (réservation, paiement…) : on ne pousse pas à
// recommencer à l'aveugle.
const TROP_LENT_ENVOI =
  'Le réseau est trop lent : votre demande a peut-être été prise en compte. Vérifiez avant de réessayer.';

export function creerRequete(
  base: string,
  jeton: () => string | undefined,
  appeler: typeof fetch = fetch,
  delaiMs: number = DELAI_REQUETE_MS,
): Requete {
  return async <T>(methode: 'GET' | 'POST', chemin: string, corps?: unknown): Promise<T> => {
    const j = jeton();
    const arret = new AbortController();
    const minuterie = setTimeout(() => arret.abort(), delaiMs);
    try {
      const r = await appeler(`${base}${chemin}`, {
        method: methode,
        headers: {
          ...(j ? { authorization: `Bearer ${j}` } : {}),
          ...(corps !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
        signal: arret.signal,
      });
      if (!r.ok) {
        throw new ErreurApi(
          r.status,
          MESSAGES[r.status] ?? 'Service indisponible. Réessayez plus tard.',
        );
      }
      return (await r.json()) as T;
    } catch (e) {
      if (e instanceof ErreurApi) throw e;
      if (arret.signal.aborted) {
        throw new ErreurApi(STATUT_RESEAU, methode === 'GET' ? TROP_LENT : TROP_LENT_ENVOI);
      }
      // fetch rejette par une TypeError quand aucune réponse n'arrive (réseau coupé).
      if (e instanceof TypeError) throw new ErreurApi(STATUT_RESEAU, SANS_RESEAU);
      throw e;
    } finally {
      clearTimeout(minuterie);
    }
  };
}

export interface AccesSalle {
  url: string;
  jeton: string;
  salle: string;
}
