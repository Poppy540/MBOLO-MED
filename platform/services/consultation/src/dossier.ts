// Lecture et écriture dans le dossier médical via la passerelle (ADR-0010), avec le compte de
// service mbolo-consultation-service (system/Condition.rs system/Composition.crs
// system/Appointment.r system/MedicationRequest.crus). Aucun contenu n'est journalisé ici.
import type {
  Appointment,
  Composition,
  Condition,
  FhirResource,
  MedicationRequest,
} from 'fhir/r4.js';
import { SYSTEME_ORDONNANCE } from '@mbolo/dossier-fhir';
import { ClientFhir, ErreurDepot, TYPE_FHIR } from '@mbolo/identite';

export interface Dossier {
  rendezVous(id: string): Promise<Appointment | undefined>;
  problemes(patientId: string): Promise<Condition[]>;
  comptesRendus(patientId: string): Promise<Composition[]>;
  ajouterCompteRendu(c: Composition): Promise<Composition>;
}

/** Ordonnances électroniques (ADR-0018) : une MedicationRequest par ligne. */
export interface DossierOrdonnances {
  ajouterLigne(m: MedicationRequest): Promise<MedicationRequest>;
  /** Lignes d'une ordonnance (recherche sans cache par numéro). */
  lignes(numero: string): Promise<MedicationRequest[]>;
  /** Toutes les lignes d'ordonnance d'un patient (vue du patient lui-même). */
  lignesDuPatient(patientId: string): Promise<MedicationRequest[]>;
  /** Change le statut d'une ligne, avec verrou optimiste (409 si elle a changé entre-temps). */
  changerStatut(
    m: MedicationRequest,
    statut: 'cancelled' | 'entered-in-error',
  ): Promise<MedicationRequest>;
}

export class DossierFhir extends ClientFhir implements Dossier, DossierOrdonnances {
  private static ligne(x: unknown): MedicationRequest {
    if ((x as { resourceType?: unknown } | null)?.resourceType !== 'MedicationRequest') {
      throw new ErreurDepot('Réponse inattendue du dossier médical.', 503);
    }
    return x as MedicationRequest;
  }

  async ajouterLigne(m: MedicationRequest): Promise<MedicationRequest> {
    const r = await this.appeler(`${this.base}/MedicationRequest`, {
      method: 'POST',
      headers: { 'content-type': TYPE_FHIR, prefer: 'return=representation' },
      body: JSON.stringify(m),
    });
    if (r.status !== 201 && r.status !== 200) throw ClientFhir.echec(r, 'Ordonnance');
    return DossierFhir.ligne(await r.json());
  }

  lignes(numero: string): Promise<MedicationRequest[]> {
    return this.rechercher(
      // FHIR R4 ne cherche pas par groupIdentifier : le numéro est aussi l'identifier de chaque ligne.
      `${this.base}/MedicationRequest?identifier=${encodeURIComponent(
        `${SYSTEME_ORDONNANCE}|${numero}`,
      )}&_count=100`,
      'Ordonnance',
      (r): r is MedicationRequest =>
        r.resourceType === 'MedicationRequest' &&
        r.groupIdentifier?.system === SYSTEME_ORDONNANCE &&
        r.groupIdentifier.value === numero,
    );
  }

  lignesDuPatient(patientId: string): Promise<MedicationRequest[]> {
    const ref = `Patient/${patientId}`;
    return this.rechercher(
      `${this.base}/MedicationRequest?subject=${encodeURIComponent(ref)}&_count=100`,
      'Ordonnance',
      (r): r is MedicationRequest =>
        r.resourceType === 'MedicationRequest' && r.subject.reference === ref,
    );
  }

  async changerStatut(
    m: MedicationRequest,
    statut: 'cancelled' | 'entered-in-error',
  ): Promise<MedicationRequest> {
    if (!m.id) throw new ErreurDepot('Ordonnance introuvable dans le dossier médical.', 409);
    const version = m.meta?.versionId;
    const r = await this.appeler(`${this.base}/MedicationRequest/${encodeURIComponent(m.id)}`, {
      method: 'PUT',
      headers: {
        'content-type': TYPE_FHIR,
        prefer: 'return=representation',
        ...(version ? { 'if-match': `W/"${version}"` } : {}),
      },
      body: JSON.stringify({ ...m, status: statut }),
    });
    if (!r.ok) throw ClientFhir.echec(r, 'Ordonnance');
    return DossierFhir.ligne(await r.json());
  }

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
