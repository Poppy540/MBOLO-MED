// Statut de la vérification d'identité des patients (ADR-0014) : aucune réservation tant que
// l'identité n'est pas « vérifiée ». Le service ne lit que ce statut, jamais le nom ni la naissance
// (la passerelle ne lui renvoie que Patient.extension et Patient.communication).
// Langue préférée du patient (ADR-0025) : seul élément du dossier patient que ce service modifie
// (la passerelle remplace Patient.communication et garde le reste de la fiche).
import type { Patient } from 'fhir/r4.js';
import { communicationPreferee, statutIdentite, type StatutIdentite } from '@mbolo/dossier-fhir';
import { ClientFhir } from '@mbolo/identite';

export interface Identites {
  statut(patientId: string): Promise<StatutIdentite | undefined>;
  /** Enregistre la langue préférée du patient (code BCP 47 déjà validé). */
  enregistrerLangue(patientId: string, code: string): Promise<void>;
}

/** Pour les tests : statuts connus d'avance ; un patient inconnu n'est jamais « vérifié ». */
export class IdentitesMemoire implements Identites {
  constructor(private readonly statuts: ReadonlyMap<string, StatutIdentite> = new Map()) {}

  readonly langues = new Map<string, string>();

  async statut(patientId: string): Promise<StatutIdentite | undefined> {
    return this.statuts.get(patientId);
  }

  async enregistrerLangue(patientId: string, code: string): Promise<void> {
    this.langues.set(patientId, code);
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

  async enregistrerLangue(patientId: string, code: string): Promise<void> {
    const corps: Patient = {
      resourceType: 'Patient',
      id: patientId,
      communication: communicationPreferee(code),
    };
    // Une autre écriture de la fiche (vérification d'identité) peut passer entre la lecture et
    // l'écriture de la passerelle (verrou optimiste) : un seul nouvel essai.
    for (let essai = 1; ; essai++) {
      const r = await this.appeler(`${this.base}/Patient/${encodeURIComponent(patientId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/fhir+json' },
        body: JSON.stringify(corps),
      });
      if (r.ok) return;
      if (essai === 1 && (r.status === 409 || r.status === 412)) continue;
      throw ClientFhir.echec(r, 'Langue');
    }
  }
}
