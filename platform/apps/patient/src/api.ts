// Appels à l'API de téléconsultation (même origine), avec le jeton du patient.
import { creerRequete, type AccesSalle } from '@mbolo/client-web';

export interface RendezVous {
  id: string;
  praticienId: string;
  debut: string;
  dureeMinutes: number;
  /** « a-payer » : créneau retenu en attendant le paiement (ADR-0017). */
  statut: 'prevu' | 'a-payer' | 'annule';
  creneauId?: string;
}

export interface Creneau {
  id: string;
  debut: string;
  dureeMinutes: number;
}

export interface Praticien {
  id: string;
  nom: string;
  specialite?: string;
  prochainCreneau?: string;
}

export function creerApi(base: string, jeton: () => string | undefined, appeler?: typeof fetch) {
  const requete = creerRequete(base, jeton, appeler);
  return {
    /** Statut de la vérification d'identité (ADR-0014) : « verifiee » ouvre les consultations. */
    identite: async () =>
      (
        await requete<{ statut: 'a-verifier' | 'verifiee' | 'refusee' | 'inconnu' }>(
          'GET',
          '/identite',
        )
      ).statut,
    mesRendezVous: async () =>
      (await requete<{ rendezVous: RendezVous[] }>('GET', '/rendez-vous')).rendezVous,
    praticiens: async () =>
      (await requete<{ praticiens: Praticien[] }>('GET', '/praticiens')).praticiens,
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
