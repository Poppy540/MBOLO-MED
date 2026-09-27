// Accès au dossier pour la vérification d'identité (ADR-0015), par la passerelle et le compte de
// service mbolo-documents-service :
// - lecture de l'identité déclarée (nom, prénom, naissance), du statut et du numéro ;
// - modification du statut et du numéro SEULEMENT (la passerelle conserve le reste du Patient) ;
// - trace de chaque consultation (AuditEvent, immuable, visible par le patient).
import type { AuditEvent, Identifier, Patient } from 'fhir/r4.js';
import { ClientFhir } from '@mbolo/identite';

export interface DossierIdentite {
  patient(patientId: string): Promise<Patient | undefined>;
  /** Remplace le statut (extension) et, s'ils sont donnés, les numéros (identifier) ; rien d'autre. */
  modifierIdentite(
    patientId: string,
    extension: NonNullable<Patient['extension']>,
    identifier?: Identifier[],
  ): Promise<void>;
  tracer(trace: AuditEvent): Promise<void>;
}

/** Pour les tests : dossier en mémoire, traces gardées dans l'ordre. */
export class DossierMemoire implements DossierIdentite {
  readonly traces: AuditEvent[] = [];
  constructor(readonly patients = new Map<string, Patient>()) {}

  async patient(patientId: string): Promise<Patient | undefined> {
    const p = this.patients.get(patientId);
    return p ? structuredClone(p) : undefined;
  }

  async modifierIdentite(
    patientId: string,
    extension: NonNullable<Patient['extension']>,
    identifier?: Identifier[],
  ): Promise<void> {
    const p = this.patients.get(patientId);
    if (!p) throw new Error('Patient inconnu.');
    this.patients.set(patientId, { ...p, extension, ...(identifier ? { identifier } : {}) });
  }

  async tracer(trace: AuditEvent): Promise<void> {
    this.traces.push(trace);
  }
}

export class DossierFhir extends ClientFhir implements DossierIdentite {
  async patient(patientId: string): Promise<Patient | undefined> {
    const r = await this.appeler(`${this.base}/Patient/${encodeURIComponent(patientId)}`, {
      headers: { 'cache-control': 'no-cache' },
    });
    if (r.status === 404 || r.status === 410) return undefined;
    if (!r.ok) throw ClientFhir.echec(r, 'Patient');
    const p = (await r.json()) as Patient;
    return p.resourceType === 'Patient' && p.id === patientId ? p : undefined;
  }

  async modifierIdentite(
    patientId: string,
    extension: NonNullable<Patient['extension']>,
    identifier?: Identifier[],
  ): Promise<void> {
    const r = await this.appeler(`${this.base}/Patient/${encodeURIComponent(patientId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/fhir+json' },
      body: JSON.stringify({
        resourceType: 'Patient',
        id: patientId,
        extension,
        ...(identifier ? { identifier } : {}),
      }),
    });
    if (!r.ok) throw ClientFhir.echec(r, 'Patient');
  }

  async tracer(trace: AuditEvent): Promise<void> {
    const r = await this.appeler(`${this.base}/AuditEvent`, {
      method: 'POST',
      headers: { 'content-type': 'application/fhir+json' },
      body: JSON.stringify(trace),
    });
    if (!r.ok) throw ClientFhir.echec(r, 'Trace');
  }
}
