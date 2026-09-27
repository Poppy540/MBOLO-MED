// Lecture et écriture dans le dossier médical via la passerelle (ADR-0010), avec le compte de
// service mbolo-consultation-service (system/Condition.rs system/Composition.crs
// system/Appointment.r). Aucun contenu n'est journalisé ici.
import type { Appointment, Composition, Condition, FhirResource } from 'fhir/r4.js';
import { ClientFhir, ErreurDepot, TYPE_FHIR } from '@mbolo/identite';

export interface Dossier {
  rendezVous(id: string): Promise<Appointment | undefined>;
  problemes(patientId: string): Promise<Condition[]>;
  comptesRendus(patientId: string): Promise<Composition[]>;
  ajouterCompteRendu(c: Composition): Promise<Composition>;
}

export class DossierFhir extends ClientFhir implements Dossier {
  async rendezVous(id: string): Promise<Appointment | undefined> {
    const r = await this.appeler(`${this.base}/Appointment/${encodeURIComponent(id)}`, {
      headers: { 'cache-control': 'no-cache' },
    });
    if (r.status === 404 || r.status === 410) return undefined;
    if (!r.ok) throw ClientFhir.echec(r, 'Rendez-vous');
    const a = (await r.json()) as FhirResource;
    return a.resourceType === 'Appointment' ? a : undefined;
  }

  problemes(patientId: string): Promise<Condition[]> {
    const ref = `Patient/${patientId}`;
    return this.rechercher(
      `${this.base}/Condition?subject=${encodeURIComponent(ref)}&_count=100`,
      'Problème',
      (r): r is Condition => r.resourceType === 'Condition' && r.subject.reference === ref,
    );
  }

  comptesRendus(patientId: string): Promise<Composition[]> {
    const ref = `Patient/${patientId}`;
    return this.rechercher(
      `${this.base}/Composition?subject=${encodeURIComponent(ref)}&_count=100`,
      'Compte-rendu',
      (r): r is Composition => r.resourceType === 'Composition' && r.subject?.reference === ref,
    );
  }

  async ajouterCompteRendu(c: Composition): Promise<Composition> {
    const r = await this.appeler(`${this.base}/Composition`, {
      method: 'POST',
      headers: { 'content-type': TYPE_FHIR, prefer: 'return=representation' },
      body: JSON.stringify(c),
    });
    if (r.status !== 201 && r.status !== 200) throw ClientFhir.echec(r, 'Compte-rendu');
    const cree = (await r.json()) as FhirResource;
    if (cree.resourceType !== 'Composition') {
      throw new ErreurDepot('Réponse inattendue du dossier médical.', 503);
    }
    return cree;
  }
}
