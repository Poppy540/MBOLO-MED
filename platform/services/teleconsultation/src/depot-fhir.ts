// Rendez-vous enregistrés dans le dossier médical (ressources Appointment, profil mbolo-rendez-vous),
// via la passerelle (ADR-0010) avec un jeton de service limité à system/Appointment.crus.
// Un rendez-vous ne contient ni motif ni texte libre (invariant mbolo-rdv-1). Rien n'est journalisé ici.
import type { Appointment, FhirResource } from 'fhir/r4.js';
import { rendezVousVideo, type Environnement } from '@mbolo/dossier-fhir';
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
  return {
    id: a.id,
    patientId,
    praticienId,
    debut: new Date(a.start).toISOString(),
    dureeMinutes: a.minutesDuration,
    statut: a.status === 'booked' ? 'prevu' : 'annule',
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

  async lire(id: string): Promise<RendezVous | undefined> {
    const r = await this.appeler(`${this.base}/Appointment/${encodeURIComponent(id)}`);
    if (r.status === 404 || r.status === 410) return undefined;
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
