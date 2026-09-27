// Rendez-vous enregistrés dans le dossier médical (ressources Appointment, profil mbolo-rendez-vous),
// via la passerelle (ADR-0010) avec un jeton de service limité à system/Appointment.crus.
// Un rendez-vous ne contient ni motif ni texte libre (invariant mbolo-rdv-1). Rien n'est journalisé ici.
import type { Appointment, FhirResource, Schedule, Slot } from 'fhir/r4.js';
import {
  agendaVideo,
  annulerRendezVous,
  creneauVideo,
  reporterRendezVous,
  type AuteurAnnulation,
  AUTEURS_ANNULATION,
  EXTENSION_DATE_ANNULATION,
  rendezVousVideo,
  type Environnement,
} from '@mbolo/dossier-fhir';
import { ClientFhir, ErreurDepot, TYPE_FHIR, type OptionsDepotFhir } from '@mbolo/identite';
import { ErreurCreneau, type Creneau, type DepotCreneaux, type Plage } from './creneaux.js';
import type { DepotRendezVous, RendezVous } from './rendez-vous.js';

const acteur = (a: Appointment, prefixe: 'Patient/' | 'Practitioner/'): string | undefined =>
  a.participant
    .map((p) => p.actor?.reference)
    .find((r): r is string => !!r?.startsWith(prefixe))
    ?.slice(prefixe.length);

/** Traduit un Appointment en rendez-vous ; tout statut autre que « booked » ferme la salle. */
export function versRendezVous(a: Appointment): RendezVous {
  const patientId = acteur(a, 'Patient/');
  const praticienId = acteur(a, 'Practitioner/');
  if (!a.id || !patientId || !praticienId || !a.start || !a.minutesDuration) {
    throw new ErreurDepot('Réponse inattendue du dossier médical.', 503);
  }
  const par = a.cancelationReason?.coding?.[0]?.code;
  const date = a.extension?.find((e) => e.url === EXTENSION_DATE_ANNULATION)?.valueDateTime;
  const annulation =
    a.status === 'cancelled' &&
    par &&
    date &&
    (AUTEURS_ANNULATION as readonly string[]).includes(par)
      ? { annulation: { par: par as AuteurAnnulation, date } }
      : {};
  const creneauId = a.slot?.[0]?.reference?.replace(/^Slot\//, '');
  return {
    id: a.id,
    patientId,
    praticienId,
    debut: new Date(a.start).toISOString(),
    dureeMinutes: a.minutesDuration,
    statut: a.status === 'booked' ? 'prevu' : 'annule',
    ...(creneauId ? { creneauId } : {}),
    ...annulation,
  };
}

const estAppointment = (r: FhirResource): r is Appointment => r.resourceType === 'Appointment';

export class DepotRendezVousFhir extends ClientFhir implements DepotRendezVous {
  constructor(
    o: OptionsDepotFhir,
    private readonly env: Environnement,
  ) {
    super(o);
  }

  private static appointment(x: unknown): Appointment {
    if ((x as { resourceType?: unknown } | null)?.resourceType !== 'Appointment') {
      throw new ErreurDepot('Réponse inattendue du dossier médical.', 503);
    }
    return x as Appointment;
  }

  async ajouter(r: Omit<RendezVous, 'id'>): Promise<RendezVous> {
    const reponse = await this.appeler(`${this.base}/Appointment`, {
      method: 'POST',
      headers: { 'content-type': TYPE_FHIR, prefer: 'return=representation' },
      body: JSON.stringify(
        rendezVousVideo({
          patientId: r.patientId,
          praticienId: r.praticienId,
          debut: r.debut,
          dureeMinutes: r.dureeMinutes,
          ...(r.creneauId ? { creneauId: r.creneauId } : {}),
          env: this.env,
        }),
      ),
    });
    if (reponse.status !== 201 && reponse.status !== 200) {
      throw ClientFhir.echec(reponse, 'Rendez-vous');
    }
    return versRendezVous(DepotRendezVousFhir.appointment(await reponse.json()));
  }

  private async lireAppointment(id: string): Promise<Appointment | undefined> {
    const r = await this.appeler(`${this.base}/Appointment/${encodeURIComponent(id)}`, {
      headers: { 'cache-control': 'no-cache' },
    });
    if (r.status === 404 || r.status === 410) return undefined;
    if (!r.ok) throw ClientFhir.echec(r, 'Rendez-vous');
    return DepotRendezVousFhir.appointment(await r.json());
  }

  async lire(id: string): Promise<RendezVous | undefined> {
    const a = await this.lireAppointment(id);
    return a ? versRendezVous(a) : undefined;
  }

  /** Mise à jour avec verrou optimiste : refusée (409) si le rendez-vous a changé depuis sa lecture. */
  async annuler(id: string, par: AuteurAnnulation, date: string): Promise<RendezVous> {
    const a = await this.lireAppointment(id);
    if (!a?.id) throw new ErreurDepot('Rendez-vous introuvable dans le dossier médical.', 409);
    const version = a.meta?.versionId;
    const annule = annulerRendezVous(a, par, date);
    const r = await this.appeler(`${this.base}/Appointment/${encodeURIComponent(a.id)}`, {
      method: 'PUT',
      headers: {
        'content-type': TYPE_FHIR,
        prefer: 'return=representation',
        ...(version ? { 'if-match': `W/"${version}"` } : {}),
      },
      body: JSON.stringify(annule),
    });
    if (!r.ok) throw ClientFhir.echec(r, 'Rendez-vous');
    return versRendezVous(DepotRendezVousFhir.appointment(await r.json()));
  }

  async reporter(
    id: string,
    c: { creneauId: string; debut: string; dureeMinutes: number },
  ): Promise<RendezVous> {
    const a = await this.lireAppointment(id);
    if (!a?.id) throw new ErreurDepot('Rendez-vous introuvable dans le dossier médical.', 409);
    const version = a.meta?.versionId;
    const r = await this.appeler(`${this.base}/Appointment/${encodeURIComponent(a.id)}`, {
      method: 'PUT',
      headers: {
        'content-type': TYPE_FHIR,
        prefer: 'return=representation',
        ...(version ? { 'if-match': `W/"${version}"` } : {}),
      },
      body: JSON.stringify(reporterRendezVous(a, c)),
    });
    if (!r.ok) throw ClientFhir.echec(r, 'Rendez-vous');
    return versRendezVous(DepotRendezVousFhir.appointment(await r.json()));
  }

  /** Recherche sans cache ; chaque résultat est revérifié (le participant doit bien être celui demandé). */
  private async parParticipant(parametre: 'patient' | 'practitioner', reference: string) {
    const trouves = await this.rechercher(
      `${this.base}/Appointment?${parametre}=${encodeURIComponent(reference)}&_count=100`,
      'Rendez-vous',
      (r): r is Appointment =>
        estAppointment(r) && r.participant.some((p) => p.actor?.reference === reference),
    );
    return trouves.map(versRendezVous);
  }

  pourPatient(patientId: string): Promise<RendezVous[]> {
    return this.parParticipant('patient', `Patient/${patientId}`);
  }

  pourPraticien(praticienId: string): Promise<RendezVous[]> {
    return this.parParticipant('practitioner', `Practitioner/${praticienId}`);
  }
}

const estSlot = (r: FhirResource): r is Slot => r.resourceType === 'Slot';
const estSchedule = (r: FhirResource): r is Schedule => r.resourceType === 'Schedule';

/**
 * Agenda (Schedule) et créneaux (Slot) des professionnels, via la passerelle, avec un jeton limité
 * à system/Schedule.crus et system/Slot.crus. Réservation avec verrou optimiste.
 */
export class DepotCreneauxFhir extends ClientFhir implements DepotCreneaux {
  /** Agenda → professionnel (le titulaire d'un agenda ne change jamais). */
  private readonly titulaires = new Map<string, string>();

  constructor(
    o: OptionsDepotFhir,
    private readonly env: Environnement,
  ) {
    super(o);
  }

  private static slot(x: unknown): Slot {
    if ((x as { resourceType?: unknown } | null)?.resourceType !== 'Slot') {
      throw new ErreurDepot('Réponse inattendue du dossier médical.', 503);
    }
    return x as Slot;
  }

  private async agendas(praticienId: string): Promise<Schedule[]> {
    const ref = `Practitioner/${praticienId}`;
    const trouves = await this.rechercher(
      `${this.base}/Schedule?actor=${encodeURIComponent(ref)}&_count=100`,
      'Agenda',
      (r): r is Schedule => estSchedule(r) && (r.actor ?? []).some((a) => a.reference === ref),
    );
    for (const a of trouves) if (a.id) this.titulaires.set(a.id, praticienId);
    return trouves;
  }

  private async titulaire(agendaId: string): Promise<string> {
    const connu = this.titulaires.get(agendaId);
    if (connu) return connu;
    const r = await this.appeler(`${this.base}/Schedule/${encodeURIComponent(agendaId)}`);
    if (!r.ok) throw ClientFhir.echec(r, 'Agenda');
    const a = (await r.json()) as Schedule;
    const ref = a.resourceType === 'Schedule' ? a.actor?.[0]?.reference : undefined;
    if (!ref?.startsWith('Practitioner/')) {
      throw new ErreurDepot('Réponse inattendue du dossier médical.', 503);
    }
    const praticienId = ref.slice('Practitioner/'.length);
    this.titulaires.set(agendaId, praticienId);
    return praticienId;
  }

  private async versCreneau(s: Slot): Promise<Creneau> {
    const agendaId = s.schedule.reference?.replace(/^Schedule\//, '');
    if (!s.id || !agendaId) throw new ErreurDepot('Réponse inattendue du dossier médical.', 503);
    return {
      id: s.id,
      praticienId: await this.titulaire(agendaId),
      debut: new Date(s.start).toISOString(),
      dureeMinutes: Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / 60_000),
      statut:
        s.status === 'free' ? 'libre' : s.status === 'busy-unavailable' ? 'retire' : 'reserve',
    };
  }

  private async creer<T extends Schedule | Slot>(ressource: T, nom: string): Promise<T> {
    const r = await this.appeler(`${this.base}/${ressource.resourceType}`, {
      method: 'POST',
      headers: { 'content-type': TYPE_FHIR, prefer: 'return=representation' },
      body: JSON.stringify(ressource),
    });
    if (r.status !== 201 && r.status !== 200) throw ClientFhir.echec(r, nom);
    const cree = (await r.json()) as T;
    if (cree.resourceType !== ressource.resourceType || !cree.id) {
      throw new ErreurDepot('Réponse inattendue du dossier médical.', 503);
    }
    return cree;
  }

  async publier(praticienId: string, plages: Plage[]): Promise<Creneau[]> {
    const agenda =
      (await this.agendas(praticienId))[0] ??
      (await this.creer(agendaVideo({ praticienId, env: this.env }), 'Agenda'));
    if (agenda.id) this.titulaires.set(agenda.id, praticienId);
    const crees: Creneau[] = [];
    for (const p of plages) {
      const s = await this.creer(
        creneauVideo({ agendaId: agenda.id ?? '', ...p, env: this.env }),
        'Créneau',
      );
      crees.push(await this.versCreneau(s));
    }
    return crees;
  }

  async duPraticien(praticienId: string, de: string, a: string): Promise<Creneau[]> {
    const agendas = (await this.agendas(praticienId)).map((x) => `Schedule/${x.id ?? ''}`);
    if (agendas.length === 0) return [];
    const slots = await this.rechercher(
      `${this.base}/Slot?schedule=${encodeURIComponent(agendas.join(','))}` +
        `&start=${encodeURIComponent(`ge${de}`)}&start=${encodeURIComponent(`lt${a}`)}&_count=100`,
      'Créneau',
      // Un créneau « entered-in-error » (retiré) n'existe plus pour le service.
      (r): r is Slot =>
        estSlot(r) &&
        r.status !== 'entered-in-error' &&
        agendas.includes(r.schedule.reference ?? ''),
    );
    return Promise.all(slots.map((s) => this.versCreneau(s)));
  }

  private async lireSlot(id: string): Promise<Slot | undefined> {
    const r = await this.appeler(`${this.base}/Slot/${encodeURIComponent(id)}`, {
      headers: { 'cache-control': 'no-cache' },
    });
    if (r.status === 404 || r.status === 410) return undefined;
    if (!r.ok) throw ClientFhir.echec(r, 'Créneau');
    return DepotCreneauxFhir.slot(await r.json());
  }

  async lire(id: string): Promise<Creneau | undefined> {
    const s = await this.lireSlot(id);
    return s && s.status !== 'entered-in-error' ? this.versCreneau(s) : undefined;
  }

  /** Change le statut avec verrou optimiste (If-Match) : une réservation concurrente échoue (409). */
  private async changerStatut(id: string, de: Slot['status'], vers: Slot['status']) {
    const s = await this.lireSlot(id);
    if (!s?.id) throw new ErreurCreneau('Créneau introuvable.', 404);
    if (s.status !== de) {
      throw new ErreurCreneau(
        vers === 'busy' ? 'Créneau déjà réservé.' : 'Créneau dans un autre état.',
        409,
      );
    }
    const version = s.meta?.versionId;
    const r = await this.appeler(`${this.base}/Slot/${encodeURIComponent(s.id)}`, {
      method: 'PUT',
      headers: {
        'content-type': TYPE_FHIR,
        prefer: 'return=representation',
        ...(version ? { 'if-match': `W/"${version}"` } : {}),
      },
      body: JSON.stringify({ ...s, status: vers }),
    });
    if (r.status === 409 || r.status === 412) {
      throw new ErreurCreneau('Créneau déjà réservé.', 409);
    }
    if (!r.ok) throw ClientFhir.echec(r, 'Créneau');
    return this.versCreneau(DepotCreneauxFhir.slot(await r.json()));
  }

  reserver(id: string): Promise<Creneau> {
    return this.changerStatut(id, 'free', 'busy');
  }

  async liberer(id: string): Promise<void> {
    await this.changerStatut(id, 'busy', 'free');
  }

  /** Professionnels titulaires d'un agenda actif (annuaire). */
  async praticiensAvecAgenda(): Promise<string[]> {
    const agendas = await this.rechercher(
      `${this.base}/Schedule?active=true&_count=100`,
      'Agenda',
      (r): r is Schedule => estSchedule(r),
    );
    const ids = agendas
      .map((a) => a.actor?.[0]?.reference ?? '')
      .filter((ref) => ref.startsWith('Practitioner/'))
      .map((ref) => ref.slice('Practitioner/'.length));
    return [...new Set(ids)];
  }

  /** Retrait : « busy-unavailable », le créneau reste dans l'agenda mais n'est plus proposé. */
  retirer(id: string): Promise<Creneau> {
    return this.changerStatut(id, 'free', 'busy-unavailable');
  }
}
