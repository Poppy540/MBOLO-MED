// Appels à l'API de téléconsultation (même origine), avec le jeton du professionnel.
import { creerRequete, type AccesSalle } from '@mbolo/client-web';

export interface RendezVous {
  id: string;
  debut: string;
  dureeMinutes: number;
  statut: 'prevu' | 'annule';
  creneauId?: string;
}

export interface Creneau {
  id: string;
  debut: string;
  dureeMinutes: number;
  statut: 'libre' | 'reserve' | 'retire';
}

export function creerApi(base: string, jeton: () => string | undefined, appeler?: typeof fetch) {
  const requete = creerRequete(base, jeton, appeler);
  return {
    mesRendezVous: async () =>
      (await requete<{ rendezVous: RendezVous[] }>('GET', '/rendez-vous')).rendezVous,
    mesCreneaux: async () => (await requete<{ creneaux: Creneau[] }>('GET', '/creneaux')).creneaux,
    publier: async (d: { debut: string; dureeMinutes: number; nombre: number }) =>
      (await requete<{ creneaux: Creneau[] }>('POST', '/creneaux', d)).creneaux,
    retirer: (creneauId: string) =>
      requete<Creneau>('POST', `/creneaux/${encodeURIComponent(creneauId)}/retrait`),
    annuler: (id: string) =>
      requete<RendezVous>('POST', `/rendez-vous/${encodeURIComponent(id)}/annulation`),
    reporter: (id: string, creneauId: string) =>
      requete<RendezVous>('POST', `/rendez-vous/${encodeURIComponent(id)}/report`, { creneauId }),
    salle: (id: string) =>
      requete<AccesSalle>('POST', `/rendez-vous/${encodeURIComponent(id)}/salle`),
  };
}
