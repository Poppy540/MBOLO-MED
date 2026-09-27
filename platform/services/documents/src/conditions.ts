// Conditions d'un dépôt de photos (ADR-0015), lues dans le dossier par la passerelle, sans cache :
// - la charte de vérification d'identité (consentement C-IDENTITE) acceptée dans sa version en vigueur ;
// - l'identité du patient pas encore vérifiée.
// Le service ne lit que le statut d'identité du Patient (Patient.extension) et ses consentements.
import type { Consent, FhirResource, Patient } from 'fhir/r4.js';
import { SYSTEMES, statutIdentite, type StatutIdentite } from '@mbolo/dossier-fhir';
import { ClientFhir } from '@mbolo/identite';

export const CATEGORIE_CHARTE = 'C-IDENTITE';

export interface Conditions {
  statutIdentite(patientId: string): Promise<StatutIdentite | undefined>;
  /** Consentements C-IDENTITE du patient (actifs ou non), pour trouver la dernière décision. */
  chartes(patientId: string): Promise<Consent[]>;
}

/**
 * La charte est acceptée si la **dernière** décision active du patient sur la charte est un accord,
 * pour la version en vigueur. Un refus plus récent, une révocation ou une ancienne version : non.
 */
export function charteAcceptee(
  consentements: readonly Consent[],
  patientId: string,
  version: string,
): boolean {
  const decisions = consentements
    .filter(
      (c) =>
        c.status === 'active' &&
        c.patient?.reference === `Patient/${patientId}` &&
        (c.category ?? []).some((cat) =>
          (cat.coding ?? []).some(
            (x) => x.system === SYSTEMES.consentement && x.code === CATEGORIE_CHARTE,
          ),
        ),
    )
    .sort((a, b) => (b.dateTime ?? '').localeCompare(a.dateTime ?? ''));
  const derniere = decisions[0];
  return derniere?.provision?.type === 'permit' && derniere.policyRule?.text === version;
}

/** Pour les tests : dossier connu d'avance. */
export class ConditionsMemoire implements Conditions {
  constructor(
    readonly statuts = new Map<string, StatutIdentite>(),
    readonly consentements: Consent[] = [],
  ) {}

  async statutIdentite(patientId: string): Promise<StatutIdentite | undefined> {
    return this.statuts.get(patientId);
  }

  async chartes(patientId: string): Promise<Consent[]> {
    return this.consentements.filter((c) => c.patient?.reference === `Patient/${patientId}`);
  }
}

/** Compte de service mbolo-documents-service : system/Patient.r (extension seule), system/Consent.s. */
export class ConditionsFhir extends ClientFhir implements Conditions {
  async statutIdentite(patientId: string): Promise<StatutIdentite | undefined> {
    const r = await this.appeler(
      `${this.base}/Patient/${encodeURIComponent(patientId)}?_elements=extension`,
      { headers: { 'cache-control': 'no-cache' } },
    );
    if (r.status === 404 || r.status === 410) return undefined;
    if (!r.ok) throw ClientFhir.echec(r, 'Patient');
    const p = (await r.json()) as Patient;
    return p.resourceType === 'Patient' && p.id === patientId ? statutIdentite(p) : undefined;
  }

  async chartes(patientId: string): Promise<Consent[]> {
    const categorie = `${SYSTEMES.consentement}|${CATEGORIE_CHARTE}`;
    return this.rechercher(
      `${this.base}/Consent?patient=${encodeURIComponent(`Patient/${patientId}`)}` +
        `&category=${encodeURIComponent(categorie)}&status=active&_count=100`,
      'Consentement',
      (r: FhirResource): r is Consent => r.resourceType === 'Consent',
    );
  }
}
