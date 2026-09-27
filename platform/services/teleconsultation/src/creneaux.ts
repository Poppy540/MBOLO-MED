// Créneaux de téléconsultation publiés par les professionnels (agenda FHIR Schedule / Slot).
// Un créneau ne contient qu'un professionnel et une plage horaire : aucune donnée de santé.
import { randomUUID } from 'node:crypto';

export interface Creneau {
  id: string;
  praticienId: string;
  /** Début (ISO 8601). */
  debut: string;
  dureeMinutes: number;
  statut: 'libre' | 'reserve';
}

export interface Plage {
  debut: string;
  dureeMinutes: number;
}

export interface DepotCreneaux {
  publier(praticienId: string, plages: Plage[]): Promise<Creneau[]>;
  /** Créneaux du professionnel qui commencent dans [de, a[ (tous statuts). */
  duPraticien(praticienId: string, de: string, a: string): Promise<Creneau[]>;
  lire(id: string): Promise<Creneau | undefined>;
  /** Libre → réservé ; refusé (409) s'il n'est plus libre ou a changé entre-temps. */
  reserver(id: string): Promise<Creneau>;
  /** Réservé → libre (après une annulation). */
  liberer(id: string): Promise<void>;
}

export class ErreurCreneau extends Error {
  constructor(
    message: string,
    readonly statut: 404 | 409,
  ) {
    super(message);
    this.name = 'ErreurCreneau';
  }
}

/** Dépôt en mémoire — développement et tests, données fictives uniquement. */
export class DepotCreneauxMemoire implements DepotCreneaux {
  private readonly donnees = new Map<string, Creneau>();

  async publier(praticienId: string, plages: Plage[]): Promise<Creneau[]> {
    return plages.map((p) => {
      const c: Creneau = {
        id: randomUUID(),
        praticienId,
        debut: new Date(p.debut).toISOString(),
        dureeMinutes: p.dureeMinutes,
        statut: 'libre',
      };
      this.donnees.set(c.id, c);
      return c;
    });
  }
  async duPraticien(praticienId: string, de: string, a: string): Promise<Creneau[]> {
    const [min, max] = [new Date(de).getTime(), new Date(a).getTime()];
    return [...this.donnees.values()].filter((c) => {
      const t = new Date(c.debut).getTime();
      return c.praticienId === praticienId && t >= min && t < max;
    });
  }
  async lire(id: string): Promise<Creneau | undefined> {
    return this.donnees.get(id);
  }
  async reserver(id: string): Promise<Creneau> {
    const c = this.donnees.get(id);
    if (!c) throw new ErreurCreneau('Créneau introuvable.', 404);
    if (c.statut !== 'libre') throw new ErreurCreneau('Créneau déjà réservé.', 409);
    const reserve: Creneau = { ...c, statut: 'reserve' };
    this.donnees.set(id, reserve);
    return reserve;
  }
  async liberer(id: string): Promise<void> {
    const c = this.donnees.get(id);
    if (c) this.donnees.set(id, { ...c, statut: 'libre' });
  }
}
