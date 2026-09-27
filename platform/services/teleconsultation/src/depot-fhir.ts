// Rendez-vous enregistrés dans le dossier médical (ressources Appointment, profil mbolo-rendez-vous),
// via la passerelle (ADR-0010) avec un jeton de service limité à system/Appointment.crus.
// Un rendez-vous ne contient ni motif ni texte libre (invariant mbolo-rdv-1). Rien n'est journalisé ici.
import type { Appointment, FhirResource } from 'fhir/r4.js';
import {
  annulerRendezVous,
  type AuteurAnnulation,
  AUTEURS_ANNULATION,
  EXTENSION_DATE_ANNULATION,
  rendezVousVideo,
  type Environnement,
} from '@mbolo/dossier-fhir';
import { ClientFhir, ErreurDepot, TYPE_FHIR, type OptionsDepotFhir } from '@mbolo/identite';
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
  return {
    id: a.id,
    patientId,
    praticienId,
    debut: new Date(a.start).toISOString(),
    dureeMinutes: a.minutesDuration,
    statut: a.status === 'booked' ? 'prevu' : 'annule',
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
