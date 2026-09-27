// Appels à l'API de téléconsultation (même origine), avec le jeton du professionnel.
import { creerRequete, type AccesSalle } from '@mbolo/client-web';

export interface RendezVous {
  id: string;
  patientId: string;
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

export interface ResumeDossier {
  motifAcces: string;
  problemes: { texte: string; verification: string; date?: string; parProfessionnel: boolean }[];
  comptesRendus: {
    id: string;
    date: string;
    sections: Partial<Record<'motif' | 'observations' | 'conclusion' | 'conduite-a-tenir', string>>;
  }[];
}

export interface SaisieCompteRendu {
  motif?: string;
  observations?: string;
  conclusion?: string;
  conduiteATenir?: string;
}

/** API de consultation clinique : dossier (après décision d'accès) et compte-rendu. */
export function creerApiConsultation(
  base: string,
  jeton: () => string | undefined,
  appeler?: typeof fetch,
) {
  const requete = creerRequete(base, jeton, appeler);
  return {
    lireDossier: (patientId: string, brisDeGlace?: { motif: string }) =>
      requete<ResumeDossier>('POST', '/dossiers/lecture', {
        patientId,
        ...(brisDeGlace ? { brisDeGlace } : {}),
      }),
    ecrireCompteRendu: (rendezVousId: string, s: SaisieCompteRendu) =>
      requete<{ id: string }>(
        'POST',
        `/rendez-vous/${encodeURIComponent(rendezVousId)}/compte-rendu`,
        s,
      ),
  };
}
