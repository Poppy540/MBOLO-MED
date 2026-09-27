// Rendez-vous de téléconsultation et règles d'accès à la salle vidéo (ADR-0011).
// Seuls le patient et le professionnel du rendez-vous obtiennent un jeton, dans une fenêtre autour
// de l'heure prévue, et seulement si la fonction est activée pour eux (flag teleconsultation.video).
// Aucune donnée de santé ici : un rendez-vous ne contient ni motif ni symptôme.
import { randomUUID } from 'node:crypto';
import type { Drapeaux } from '@mbolo/drapeaux';
import type { Utilisateur } from '@mbolo/identite';

export interface RendezVous {
  id: string;
  patientId: string;
  praticienId: string;
  /** Date et heure de début (ISO 8601). */
  debut: string;
  dureeMinutes: number;
  statut: 'prevu' | 'annule';
}

export interface DepotRendezVous {
  ajouter(r: Omit<RendezVous, 'id'>): Promise<RendezVous>;
  lire(id: string): Promise<RendezVous | undefined>;
  pourPatient(patientId: string): Promise<RendezVous[]>;
  pourPraticien(praticienId: string): Promise<RendezVous[]>;
}

/** Dépôt en mémoire — prototype, données fictives uniquement (le service refuse la production). */
export class DepotRendezVousMemoire implements DepotRendezVous {
  private readonly donnees = new Map<string, RendezVous>();

  async ajouter(r: Omit<RendezVous, 'id'>): Promise<RendezVous> {
    const complet = { ...r, id: randomUUID() };
    this.donnees.set(complet.id, complet);
    return complet;
  }
  async lire(id: string): Promise<RendezVous | undefined> {
    return this.donnees.get(id);
  }
  async pourPatient(patientId: string): Promise<RendezVous[]> {
    return [...this.donnees.values()].filter((r) => r.patientId === patientId);
  }
  async pourPraticien(praticienId: string): Promise<RendezVous[]> {
    return [...this.donnees.values()].filter((r) => r.praticienId === praticienId);
  }
}

/** Salle vidéo : implémentée par LiveKit (salle.ts), remplaçable en test. */
export interface FournisseurSalle {
  readonly url: string;
  /** Crée la salle si besoin : deux participants au maximum, jamais d'enregistrement. */
  preparer(nom: string): Promise<void>;
  jeton(o: { salle: string; identite: string; nomAffiche: string }): Promise<string>;
}

export class ErreurTeleconsultation extends Error {
  constructor(
    message: string,
    readonly statut: 403 | 404 | 409,
  ) {
    super(message);
    this.name = 'ErreurTeleconsultation';
  }
}

/** Ouverture de la salle : 15 min avant le début ; fermeture : 30 min après la fin prévue. */
const AVANT_MS = 15 * 60_000;
const APRES_MS = 30 * 60_000;

export interface AccesSalle {
  url: string;
  jeton: string;
  salle: string;
}

export class ServiceTeleconsultation {
  constructor(
    private readonly depot: DepotRendezVous,
    private readonly salles: FournisseurSalle,
    private readonly drapeaux: Pick<Drapeaux, 'estActif'>,
    private readonly maintenant: () => Date = () => new Date(),
  ) {}

  private async exigerFonction(u: Utilisateur): Promise<void> {
    const actif = await this.drapeaux.estActif('teleconsultation.video', {
      sujet: u.sujet,
      ...(u.roles[0] ? { typeUtilisateur: u.roles[0] } : {}),
    });
    if (!actif) throw new ErreurTeleconsultation('Fonction non disponible.', 403);
  }

  /** Le patient demande un rendez-vous vidéo avec un professionnel. */
  async demander(
    u: Utilisateur,
    d: { praticienId: string; debut: string; dureeMinutes: number },
  ): Promise<RendezVous> {
    if (!u.roles.includes('patient') || !u.patientId) {
      throw new ErreurTeleconsultation('Accès refusé.', 403);
    }
    await this.exigerFonction(u);
    return this.depot.ajouter({
      patientId: u.patientId,
      praticienId: d.praticienId,
      debut: new Date(d.debut).toISOString(),
      dureeMinutes: d.dureeMinutes,
      statut: 'prevu',
    });
  }

  async mesRendezVous(u: Utilisateur): Promise<RendezVous[]> {
    if (u.roles.includes('patient') && u.patientId) return this.depot.pourPatient(u.patientId);
    if (u.roles.includes('professionnel') && u.practitionerId) {
      return this.depot.pourPraticien(u.practitionerId);
    }
    throw new ErreurTeleconsultation('Accès refusé.', 403);
  }

  /** Jeton de salle : participant du rendez-vous, dans la fenêtre horaire, fonction activée. */
  async rejoindre(u: Utilisateur, rendezVousId: string): Promise<AccesSalle> {
    const r = await this.depot.lire(rendezVousId);
    const estPatient = !!r && u.roles.includes('patient') && u.patientId === r.patientId;
    const estPraticien =
      !!r && u.roles.includes('professionnel') && u.practitionerId === r.praticienId;
    // Même réponse si le rendez-vous n'existe pas ou n'est pas le sien : rien n'est révélé.
    if (!r || (!estPatient && !estPraticien)) {
      throw new ErreurTeleconsultation('Rendez-vous introuvable.', 404);
    }
    await this.exigerFonction(u);
    if (r.statut !== 'prevu') throw new ErreurTeleconsultation('Rendez-vous annulé.', 409);
    const debut = new Date(r.debut).getTime();
    const fin = debut + r.dureeMinutes * 60_000;
    const t = this.maintenant().getTime();
    if (t < debut - AVANT_MS || t > fin + APRES_MS) {
      throw new ErreurTeleconsultation('La salle n’est pas ouverte à cette heure.', 409);
    }
    const salle = `rdv-${r.id}`;
    await this.salles.preparer(salle);
    const jeton = await this.salles.jeton({
      salle,
      // Identifiant technique, jamais le nom de la personne.
      identite: u.sujet,
      nomAffiche: estPraticien ? 'Professionnel de santé' : 'Patient',
    });
    return { url: this.salles.url, jeton, salle };
  }
}
