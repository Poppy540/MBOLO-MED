// Statut de la vérification d'identité des patients (ADR-0014) : aucune réservation tant que
// l'identité n'est pas « vérifiée ». Le service ne lit que ce statut, jamais le nom ni la naissance
// (la passerelle ne lui renvoie que Patient.extension).
import type { Patient } from 'fhir/r4.js';
import { statutIdentite, type StatutIdentite } from '@mbolo/dossier-fhir';
import { ClientFhir } from '@mbolo/identite';

export interface Identites {
  statut(patientId: string): Promise<StatutIdentite | undefined>;
}

/** Pour les tests : statuts connus d'avance ; un patient inconnu n'est jamais « vérifié ». */
export class IdentitesMemoire implements Identites {
  constructor(private readonly statuts: ReadonlyMap<string, StatutIdentite> = new Map()) {}

  async statut(patientId: string): Promise<StatutIdentite | undefined> {
    return this.statuts.get(patientId);
  }
}

export class IdentitesFhir extends ClientFhir implements Identites {
  async statut(patientId: string): Promise<StatutIdentite | undefined> {
    // Sans cache : une vérification (ou un refus) prend effet aussitôt.
    const r = await this.appeler(
      `${this.base}/Patient/${encodeURIComponent(patientId)}?_elements=extension`,
      { headers: { 'cache-control': 'no-cache' } },
    );
    if (r.status === 404 || r.status === 410) return undefined;
    if (!r.ok) throw ClientFhir.echec(r, 'Patient');
    const p = (await r.json()) as Patient;
    return p.resourceType === 'Patient' ? statutIdentite(p) : undefined;
  }
}
