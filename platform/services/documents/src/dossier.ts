// Accès au dossier pour la vérification d'identité (ADR-0015), par la passerelle et le compte de
// service mbolo-documents-service :
// - lecture de l'identité déclarée (nom, prénom, naissance), du statut et du numéro ;
// - modification du statut, des identifiants et, après une perte du téléphone (ADR-0023), du
//   numéro de téléphone SEULEMENT (la passerelle conserve le reste du Patient) ;
// - trace de chaque consultation (AuditEvent, immuable, visible par le patient).
import type { AuditEvent, ContactPoint, Identifier, Patient, Practitioner } from 'fhir/r4.js';
import type { ElementsDecision } from '@mbolo/dossier-fhir';
import { ClientFhir, ErreurDepot } from '@mbolo/identite';

export interface DossierIdentite {
  patient(patientId: string): Promise<Patient | undefined>;
  /** Remplace le statut (extension) et, s'ils sont donnés, les numéros (identifier) ; rien d'autre. */
  modifierIdentite(
    patientId: string,
    extension: NonNullable<Patient['extension']>,
    identifier?: Identifier[],
  ): Promise<void>;
  /** Remplace le numéro de téléphone (`telecom`) ; rien d'autre (ADR-0023). */
  modifierTelephone(patientId: string, telecom: ContactPoint[]): Promise<void>;
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

  async modifierTelephone(patientId: string, telecom: ContactPoint[]): Promise<void> {
    const p = this.patients.get(patientId);
    if (!p) throw new Error('Patient inconnu.');
    this.patients.set(patientId, { ...p, telecom });
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

  async modifierTelephone(patientId: string, telecom: ContactPoint[]): Promise<void> {
    const r = await this.appeler(`${this.base}/Patient/${encodeURIComponent(patientId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/fhir+json' },
      body: JSON.stringify({ resourceType: 'Patient', id: patientId, telecom }),
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

/** Éléments de la fiche d'un professionnel que sa déclaration remplace (ADR-0026, 3b). */
export type ElementsDeclares = Required<Pick<Practitioner, 'qualification' | 'communication'>>;

/**
 * Fiche du professionnel candidat, par la passerelle et le compte de service mbolo-documents-service :
 * lecture du statut, de l'activation et de la déclaration ; modification de la déclaration
 * (`qualification`, `communication`) par le candidat, ou de l'activation et du statut (`active`,
 * `extension`, `qualification`) sur décision d'une personne habilitée ; jamais rien d'autre, et
 * seulement si la fiche n'a pas changé depuis sa lecture (verrou optimiste). Chaque consultation du
 * dossier par une personne habilitée est tracée (AuditEvent, immuable).
 */
export interface FichesPraticiens {
  lire(practitionerId: string): Promise<{ fiche: Practitioner; version: string } | undefined>;
  declarer(practitionerId: string, elements: ElementsDeclares, version: string): Promise<void>;
  decider(practitionerId: string, elements: ElementsDecision, version: string): Promise<void>;
  tracer(trace: AuditEvent): Promise<void>;
}

/** Pour les tests : fiches en mémoire, version incrémentée à chaque écriture. */
export class FichesMemoire implements FichesPraticiens {
  readonly versions = new Map<string, number>();
  readonly traces: AuditEvent[] = [];
  constructor(readonly fiches = new Map<string, Practitioner>()) {}

  async lire(practitionerId: string) {
    const fiche = this.fiches.get(practitionerId);
    if (!fiche) return undefined;
    return {
      fiche: structuredClone(fiche),
      version: String(this.versions.get(practitionerId) ?? 1),
    };
  }

  /** Remplace la fiche hors de la déclaration (ex. décision de vérification) : nouvelle version. */
  changer(practitionerId: string, fiche: Practitioner): void {
    this.fiches.set(practitionerId, fiche);
    this.versions.set(practitionerId, (this.versions.get(practitionerId) ?? 1) + 1);
  }

  async declarer(practitionerId: string, elements: ElementsDeclares, version: string) {
    this.remplacer(practitionerId, elements, version);
  }

  async decider(practitionerId: string, elements: ElementsDecision, version: string) {
    this.remplacer(practitionerId, elements, version);
  }

  async tracer(trace: AuditEvent): Promise<void> {
    this.traces.push(trace);
  }

  private remplacer(practitionerId: string, elements: Partial<Practitioner>, version: string) {
    const fiche = this.fiches.get(practitionerId);
    if (!fiche) throw new Error('Fiche inconnue.');
    if (String(this.versions.get(practitionerId) ?? 1) !== version) {
      throw new ErreurDepot('Fiche modifiée entre-temps.', 409);
    }
    this.changer(practitionerId, { ...fiche, ...elements });
  }
}

export class FichesFhir extends ClientFhir implements FichesPraticiens {
  async lire(practitionerId: string) {
    const r = await this.appeler(
      `${this.base}/Practitioner/${encodeURIComponent(practitionerId)}`,
      { headers: { 'cache-control': 'no-cache' } },
    );
    if (r.status === 404 || r.status === 410) return undefined;
    if (!r.ok) throw ClientFhir.echec(r, 'Fiche');
    const fiche = (await r.json()) as Practitioner;
    if (fiche.resourceType !== 'Practitioner' || fiche.id !== practitionerId) return undefined;
    return { fiche, version: fiche.meta?.versionId ?? '' };
  }

  async declarer(practitionerId: string, elements: ElementsDeclares, version: string) {
    await this.remplacer(practitionerId, elements, version);
  }

  async decider(practitionerId: string, elements: ElementsDecision, version: string) {
    await this.remplacer(practitionerId, elements, version);
  }

  async tracer(trace: AuditEvent): Promise<void> {
    const r = await this.appeler(`${this.base}/AuditEvent`, {
      method: 'POST',
      headers: { 'content-type': 'application/fhir+json' },
      body: JSON.stringify(trace),
    });
    if (!r.ok) throw ClientFhir.echec(r, 'Trace');
  }

  /** La passerelle ne remplace que les éléments envoyés, et refuse si la fiche a changé (412). */
  private async remplacer(
    practitionerId: string,
    elements: Partial<Practitioner>,
    version: string,
  ): Promise<void> {
    if (!version) throw new ErreurDepot('Fiche modifiée entre-temps.', 409);
    const r = await this.appeler(
      `${this.base}/Practitioner/${encodeURIComponent(practitionerId)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/fhir+json', 'if-match': `W/"${version}"` },
        body: JSON.stringify({ resourceType: 'Practitioner', id: practitionerId, ...elements }),
      },
    );
    if (!r.ok) throw ClientFhir.echec(r, 'Fiche');
  }
}
