// Dépôt des consentements dans le serveur FHIR du dossier médical (ADR-0001, ADR-0009).
// Les consentements sont des ressources Consent du dossier : conservées, versionnées, jamais supprimées.
// Aucun contenu de ressource n'est journalisé ici.
import type { Consent } from 'fhir/r4.js';
import { ClientFhir, ErreurDepot, TYPE_FHIR } from './client-fhir.js';
import type { DepotConsentements } from './consentements.js';

export { ErreurDepot } from './client-fhir.js';
export type { OptionsDepotFhir } from './client-fhir.js';

export class DepotFhir extends ClientFhir implements DepotConsentements {
  private static consent(x: unknown): Consent {
    if ((x as { resourceType?: unknown } | null)?.resourceType !== 'Consent') {
      throw new ErreurDepot('Réponse inattendue du dossier médical.', 503);
    }
    return x as Consent;
  }

  async ajouter(c: Consent): Promise<Consent> {
    const r = await this.appeler(`${this.base}/Consent`, {
      method: 'POST',
      headers: { 'content-type': TYPE_FHIR, prefer: 'return=representation' },
      body: JSON.stringify(c),
    });
    if (r.status !== 201 && r.status !== 200) throw ClientFhir.echec(r, 'Consentement');
    return DepotFhir.consent(await r.json());
  }

  async lire(id: string): Promise<Consent | undefined> {
    const r = await this.appeler(`${this.base}/Consent/${encodeURIComponent(id)}`);
    if (r.status === 404 || r.status === 410) return undefined;
    if (!r.ok) throw ClientFhir.echec(r, 'Consentement');
    return DepotFhir.consent(await r.json());
  }

  /** Mise à jour avec verrou optimiste : refusée si la ressource a changé depuis sa lecture. */
  async remplacer(c: Consent): Promise<void> {
    if (!c.id) throw new ErreurDepot('Consentement sans identifiant.', 422);
    const version = c.meta?.versionId;
    const r = await this.appeler(`${this.base}/Consent/${encodeURIComponent(c.id)}`, {
      method: 'PUT',
      headers: {
        'content-type': TYPE_FHIR,
        ...(version ? { 'if-match': `W/"${version}"` } : {}),
      },
      body: JSON.stringify(c),
    });
    if (!r.ok) throw ClientFhir.echec(r, 'Consentement');
  }

  /** Recherche sans cache : une révocation doit prendre effet immédiatement pour l'accès. */
  async parPatient(patientId: string): Promise<Consent[]> {
    return this.rechercher(
      `${this.base}/Consent?patient=${encodeURIComponent(`Patient/${patientId}`)}&_count=100`,
      'Consentement',
      (r): r is Consent =>
        r.resourceType === 'Consent' && r.patient?.reference === `Patient/${patientId}`,
    );
  }
}
