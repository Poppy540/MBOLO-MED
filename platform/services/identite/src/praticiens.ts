// Statut des professionnels (ADR-0026, étape 5) : avant tout accès d'un professionnel au dossier
// d'un patient, sa fiche est relue sans cache ; suspendu, à revérifier ou inscription échue → refus,
// à l'instant. Le compte de service ne lit que l'activité, le statut et l'inscription de la fiche.
import type { Practitioner } from 'fhir/r4.js';
import { praticienVerifie } from '@mbolo/dossier-fhir';
import { ClientFhir } from './client-fhir.js';

export interface FichesPraticiens {
  /** Fiche active, vérifiée et inscription valable à cette date ; fiche absente → false. */
  verifie(practitionerId: string, maintenant: Date): Promise<boolean>;
}

export class FichesPraticiensFhir extends ClientFhir implements FichesPraticiens {
  async verifie(practitionerId: string, maintenant: Date): Promise<boolean> {
    const r = await this.appeler(
      `${this.base}/Practitioner/${encodeURIComponent(practitionerId)}`,
      {
        headers: { 'cache-control': 'no-cache' },
      },
    );
    if (r.status === 404 || r.status === 410) return false;
    if (!r.ok) throw ClientFhir.echec(r, 'Professionnel');
    const p = (await r.json()) as Practitioner;
    return p.resourceType === 'Practitioner' && praticienVerifie(p, maintenant);
  }
}

/** Tests et développement sans dossier : fiches vérifiées données. */
export class FichesPraticiensMemoire implements FichesPraticiens {
  constructor(readonly verifiees: Set<string> = new Set()) {}
  async verifie(practitionerId: string): Promise<boolean> {
    return this.verifiees.has(practitionerId);
  }
}
