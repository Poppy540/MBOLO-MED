// Rendez-vous de téléconsultation et règles d'accès à la salle vidéo (ADR-0011).
// Seuls le patient et le professionnel du rendez-vous obtiennent un jeton, dans une fenêtre autour
// de l'heure prévue, et seulement si la fonction est activée pour eux (flag teleconsultation.video).
// Aucune donnée de santé ici : un rendez-vous ne contient ni motif ni symptôme.
import { randomUUID } from 'node:crypto';
import type { AuteurAnnulation } from '@mbolo/dossier-fhir';
import type { Drapeaux } from '@mbolo/drapeaux';
import type { Utilisateur } from '@mbolo/identite';
import { ErreurCreneau, type Creneau, type DepotCreneaux, type Plage } from './creneaux.js';

export interface RendezVous {
  id: string;
  patientId: string;
  praticienId: string;
  /** Date et heure de début (ISO 8601). */
  debut: string;
  dureeMinutes: number;
  statut: 'prevu' | 'annule';
  /** Créneau réservé dont découle le rendez-vous. */
  creneauId?: string;
  /** Qui a annulé et quand (jamais de motif). */
  annulation?: { par: AuteurAnnulation; date: string };
}

export interface DepotRendezVous {
  ajouter(r: Omit<RendezVous, 'id'>): Promise<RendezVous>;
  lire(id: string): Promise<RendezVous | undefined>;
  pourPatient(patientId: string): Promise<RendezVous[]>;
  pourPraticien(praticienId: string): Promise<RendezVous[]>;
  /** Annule en conservant le rendez-vous ; refusé (409) s'il a changé entre-temps. */
  annuler(id: string, par: AuteurAnnulation, date: string): Promise<RendezVous>;
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
  async annuler(id: string, par: AuteurAnnulation, date: string): Promise<RendezVous> {
    const r = this.donnees.get(id);
    if (!r) throw new ErreurTeleconsultation('Rendez-vous introuvable.', 404);
    const annule: RendezVous = { ...r, statut: 'annule', annulation: { par, date } };
    this.donnees.set(id, annule);
    return annule;
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
/** Horizon des créneaux proposés aux patients. */
const HORIZON_MS = 14 * 24 * 3_600_000;
/** Au plus 16 créneaux publiés à la fois. */
export const CRENEAUX_MAX = 16;

export interface AccesSalle {
  url: string;
  jeton: string;
  salle: string;
}

export class ServiceTeleconsultation {
  constructor(
    private readonly depot: DepotRendezVous,
    private readonly creneaux: DepotCreneaux,
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

  /**
   * Le professionnel publie des créneaux consécutifs, à venir, sans chevauchement avec les siens.
   * Aucun texte libre : seulement une plage horaire.
   */
  async publier(
    u: Utilisateur,
    d: { debut: string; dureeMinutes: number; nombre: number },
  ): Promise<Creneau[]> {
    if (!u.roles.includes('professionnel') || !u.practitionerId) {
      throw new ErreurTeleconsultation('Accès refusé.', 403);
    }
    await this.exigerFonction(u);
    if (d.nombre < 1 || d.nombre > CRENEAUX_MAX) {
      throw new ErreurTeleconsultation('Nombre de créneaux invalide.', 409);
    }
    const debut = new Date(d.debut).getTime();
    if (debut <= this.maintenant().getTime()) {
      throw new ErreurTeleconsultation('Un créneau doit commencer dans le futur.', 409);
    }
    const duree = d.dureeMinutes * 60_000;
    const plages: Plage[] = Array.from({ length: d.nombre }, (_, i) => ({
      debut: new Date(debut + i * duree).toISOString(),
      dureeMinutes: d.dureeMinutes,
    }));
    const fin = debut + d.nombre * duree;
    // Chevauchement : tout créneau existant qui commence avant la fin et finit après le début.
    const existants = await this.creneaux.duPraticien(
      u.practitionerId,
      new Date(debut - 2 * 3_600_000).toISOString(),
      new Date(fin).toISOString(),
    );
    const chevauche = existants.some((c) => {
      const t = new Date(c.debut).getTime();
      return t < fin && t + c.dureeMinutes * 60_000 > debut;
    });
    if (chevauche) {
      throw new ErreurTeleconsultation('Ces créneaux chevauchent des créneaux existants.', 409);
    }
    return this.creneaux.publier(u.practitionerId, plages);
  }

  /** Créneaux libres d'un professionnel dans les 14 prochains jours (patients de la cohorte). */
  async creneauxLibres(u: Utilisateur, praticienId: string): Promise<Creneau[]> {
    if (!u.roles.includes('patient') || !u.patientId) {
      throw new ErreurTeleconsultation('Accès refusé.', 403);
    }
    await this.exigerFonction(u);
    const t = this.maintenant().getTime();
    const tous = await this.creneaux.duPraticien(
      praticienId,
      new Date(t).toISOString(),
      new Date(t + HORIZON_MS).toISOString(),
    );
    return tous.filter((c) => c.statut === 'libre').sort((x, y) => x.debut.localeCompare(y.debut));
  }

  /** Le patient réserve un créneau libre : le créneau est bloqué, puis le rendez-vous créé. */
  async demander(u: Utilisateur, d: { creneauId: string }): Promise<RendezVous> {
    if (!u.roles.includes('patient') || !u.patientId) {
      throw new ErreurTeleconsultation('Accès refusé.', 403);
    }
    await this.exigerFonction(u);
    const c = await this.creneaux.lire(d.creneauId);
    if (!c) throw new ErreurTeleconsultation('Créneau introuvable.', 404);
    if (c.statut !== 'libre' || new Date(c.debut).getTime() <= this.maintenant().getTime()) {
      throw new ErreurTeleconsultation('Créneau non disponible.', 409);
    }
    // Verrou : deux patients ne peuvent pas réserver le même créneau.
    try {
      await this.creneaux.reserver(c.id);
    } catch (e) {
      if (e instanceof ErreurCreneau) throw new ErreurTeleconsultation(e.message, e.statut);
      throw e;
    }
    try {
      return await this.depot.ajouter({
        patientId: u.patientId,
        praticienId: c.praticienId,
        debut: c.debut,
        dureeMinutes: c.dureeMinutes,
        statut: 'prevu',
        creneauId: c.id,
      });
    } catch (e) {
      // Rendez-vous refusé : le créneau redevient libre.
      await this.creneaux.liberer(c.id).catch(() => undefined);
      throw e;
    }
  }

  async mesRendezVous(u: Utilisateur): Promise<RendezVous[]> {
    if (u.roles.includes('patient') && u.patientId) return this.depot.pourPatient(u.patientId);
    if (u.roles.includes('professionnel') && u.practitionerId) {
      return this.depot.pourPraticien(u.practitionerId);
    }
    throw new ErreurTeleconsultation('Accès refusé.', 403);
  }

  /** Rendez-vous dont l'utilisateur est participant ; sinon 404, sans révéler s'il existe. */
  private async participant(
    u: Utilisateur,
    rendezVousId: string,
  ): Promise<{ r: RendezVous; estPraticien: boolean }> {
    const r = await this.depot.lire(rendezVousId);
    const estPatient = !!r && u.roles.includes('patient') && u.patientId === r.patientId;
    const estPraticien =
      !!r && u.roles.includes('professionnel') && u.practitionerId === r.praticienId;
    if (!r || (!estPatient && !estPraticien)) {
      throw new ErreurTeleconsultation('Rendez-vous introuvable.', 404);
    }
    return { r, estPraticien };
  }

  /**
   * Annulation par le patient ou le professionnel du rendez-vous, tant qu'il n'est pas terminé.
   * Pas de condition de flag : si la fonction est désactivée (retour arrière), chacun peut encore
   * annuler ses rendez-vous. Aucun motif n'est demandé ni conservé.
   */
  async annuler(u: Utilisateur, rendezVousId: string): Promise<RendezVous> {
    const { r, estPraticien } = await this.participant(u, rendezVousId);
    if (r.statut !== 'prevu') throw new ErreurTeleconsultation('Rendez-vous déjà annulé.', 409);
    const maintenant = this.maintenant();
    const fin = new Date(r.debut).getTime() + r.dureeMinutes * 60_000;
    if (maintenant.getTime() > fin) {
      throw new ErreurTeleconsultation('Un rendez-vous passé ne peut plus être annulé.', 409);
    }
    const annule = await this.depot.annuler(
      r.id,
      estPraticien ? 'professionnel' : 'patient',
      maintenant.toISOString(),
    );
    // Le créneau à venir redevient libre. En cas d'échec, il reste réservé (jamais de double
    // réservation) et l'annulation, déjà enregistrée, reste valable.
    if (r.creneauId && new Date(r.debut).getTime() > maintenant.getTime()) {
      await this.creneaux.liberer(r.creneauId).catch(() => undefined);
    }
    return annule;
  }

  /** Jeton de salle : participant du rendez-vous, dans la fenêtre horaire, fonction activée. */
  async rejoindre(u: Utilisateur, rendezVousId: string): Promise<AccesSalle> {
    const { r, estPraticien } = await this.participant(u, rendezVousId);
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
