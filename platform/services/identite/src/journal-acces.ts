// Journal des accès au dossier (principe n°3) : chaque décision d'accès, accordée ou refusée, est
// consignée comme AuditEvent FHIR dans le dossier du patient. Jamais modifiée ni supprimée
// (la passerelle refuse toute mise à jour d'un AuditEvent).
import type { AuditEvent } from 'fhir/r4.js';
import { SYSTEMES } from '@mbolo/dossier-fhir';
import { ClientFhir, ErreurDepot, TYPE_FHIR } from './client-fhir.js';

export type SousTypeTrace = 'acces-dossier' | 'bris-de-glace' | 'revue-bris-de-glace';

export interface JournalAcces {
  consigner(e: AuditEvent): Promise<void>;
  /** Traces concernant le dossier d'un patient, les plus récentes d'abord. */
  parPatient(patientId: string): Promise<AuditEvent[]>;
  /** Traces d'un sous-type (ex. tous les bris de glace), les plus récentes d'abord. */
  parSousType(code: SousTypeTrace): Promise<AuditEvent[]>;
}

const deSousType = (e: AuditEvent, code: SousTypeTrace): boolean =>
  (e.subtype ?? []).some((s) => s.system === SYSTEMES.sousTypeAudit && s.code === code);

const concerne = (e: AuditEvent, patientId: string): boolean =>
  (e.entity ?? []).some((x) => x.what?.reference === `Patient/${patientId}`);

const plusRecentes = (a: AuditEvent, b: AuditEvent): number => b.recorded.localeCompare(a.recorded);

/** Journal en mémoire — développement et tests uniquement. */
export class JournalAccesMemoire implements JournalAcces {
  readonly traces: AuditEvent[] = [];

  async consigner(e: AuditEvent): Promise<void> {
    this.traces.push({ ...e, id: `trace-${this.traces.length + 1}` });
  }

  async parPatient(patientId: string): Promise<AuditEvent[]> {
    return this.traces.filter((e) => concerne(e, patientId)).sort(plusRecentes);
  }

  async parSousType(code: SousTypeTrace): Promise<AuditEvent[]> {
    return this.traces.filter((e) => deSousType(e, code)).sort(plusRecentes);
  }
}

export class JournalAccesFhir extends ClientFhir implements JournalAcces {
  async consigner(e: AuditEvent): Promise<void> {
    const r = await this.appeler(`${this.base}/AuditEvent`, {
      method: 'POST',
      headers: { 'content-type': TYPE_FHIR, prefer: 'return=minimal' },
      body: JSON.stringify(e),
    });
    if (r.status !== 201 && r.status !== 200) throw ClientFhir.echec(r, 'Trace d’accès');
  }

  async parPatient(patientId: string): Promise<AuditEvent[]> {
    const traces = await this.rechercher(
      `${this.base}/AuditEvent?patient=${encodeURIComponent(`Patient/${patientId}`)}&_sort=-date&_count=100`,
      'Trace d’accès',
      (r): r is AuditEvent => r.resourceType === 'AuditEvent' && concerne(r, patientId),
    );
    return traces.sort(plusRecentes);
  }

  async parSousType(code: SousTypeTrace): Promise<AuditEvent[]> {
    const traces = await this.rechercher(
      `${this.base}/AuditEvent?subtype=${encodeURIComponent(`${SYSTEMES.sousTypeAudit}|${code}`)}&_sort=-date&_count=100`,
      'Trace d’accès',
      (r): r is AuditEvent => r.resourceType === 'AuditEvent' && deSousType(r, code),
    );
    return traces.sort(plusRecentes);
  }
}

export { ErreurDepot };
