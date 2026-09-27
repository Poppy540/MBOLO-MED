// Appels à l'API de téléconsultation (même origine), avec le jeton du patient.

export interface RendezVous {
  id: string;
  praticienId: string;
  debut: string;
  dureeMinutes: number;
  statut: 'prevu' | 'annule';
  creneauId?: string;
}

export interface Creneau {
  id: string;
  debut: string;
  dureeMinutes: number;
}

export interface AccesSalle {
  url: string;
  jeton: string;
  salle: string;
}

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
  403: 'La téléconsultation n’est pas encore ouverte pour votre compte.',
  404: 'Introuvable.',
  409: 'Ce n’est plus possible. Choisissez un autre créneau.',
};

export function creerApi(
  base: string,
  jeton: () => string | undefined,
  appeler: typeof fetch = fetch,
) {
  const requete = async <T>(
    methode: 'GET' | 'POST',
    chemin: string,
    corps?: unknown,
  ): Promise<T> => {
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
  return {
    mesRendezVous: async () =>
      (await requete<{ rendezVous: RendezVous[] }>('GET', '/rendez-vous')).rendezVous,
    creneauxLibres: async (praticienId: string) =>
      (
        await requete<{ creneaux: Creneau[] }>(
          'GET',
          `/praticiens/${encodeURIComponent(praticienId)}/creneaux`,
        )
      ).creneaux,
    reserver: (creneauId: string) => requete<RendezVous>('POST', '/rendez-vous', { creneauId }),
    annuler: (id: string) =>
      requete<RendezVous>('POST', `/rendez-vous/${encodeURIComponent(id)}/annulation`),
    salle: (id: string) =>
      requete<AccesSalle>('POST', `/rendez-vous/${encodeURIComponent(id)}/salle`),
  };
}

export type Api = ReturnType<typeof creerApi>;
