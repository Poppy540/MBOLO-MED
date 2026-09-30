// Contacts lus dans le dossier médical via la passerelle (ADR-0010), avec le compte de service
// mbolo-notifications-service (system/Patient.r system/Practitioner.r system/Consent.s).
import type { ContactPoint, Consent, FhirResource, Patient, Practitioner } from 'fhir/r4.js';
import { enAttenteApresPerte } from '@mbolo/dossier-fhir';
import { ClientFhir, consentementActif } from '@mbolo/identite';
import type { Destinataire, SourceContacts } from './notifications.js';

export class ContactsFhir extends ClientFhir implements SourceContacts {
  /** Premier numéro de téléphone (mobile de préférence) ; seul l'élément telecom est demandé. */
  async telephone(d: Destinataire): Promise<string | undefined> {
    return (await this.numero(d))?.value;
  }

  /** 24 heures après un changement du numéro pour perte (ADR-0023), lu sans cache. */
  async enAttenteApresPerte(patientId: string): Promise<boolean> {
    const numero = await this.numero(`Patient/${patientId}`);
    return numero !== undefined && enAttenteApresPerte(numero, new Date());
  }

  private async numero(d: Destinataire): Promise<ContactPoint | undefined> {
    const r = await this.appeler(`${this.base}/${d}?_elements=telecom`, {
      headers: { 'cache-control': 'no-cache' },
    });
    if (r.status === 404 || r.status === 410) return undefined;
    if (!r.ok) throw ClientFhir.echec(r, 'Contact');
    const res = (await r.json()) as Patient | Practitioner;
    if (`${res.resourceType}/${res.id ?? ''}` !== d) return undefined;
    const telephones = (res.telecom ?? []).filter((t) => t.system === 'phone' && t.value);
    return telephones.find((t) => t.use === 'mobile') ?? telephones[0];
  }

  /** Consentement C-RAPPELS actif et accepté, lu sans cache (une révocation prend effet aussitôt). */
  async accepteRappels(patientId: string): Promise<boolean> {
    const consentements = await this.rechercher(
      `${this.base}/Consent?patient=${encodeURIComponent(`Patient/${patientId}`)}&status=active&_count=100`,
      'Consentement',
      (r: FhirResource): r is Consent => r.resourceType === 'Consent',
    );
    return consentementActif(consentements, patientId, 'C-RAPPELS');
  }
}
