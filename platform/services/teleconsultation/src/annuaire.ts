// Annuaire des professionnels : nom et spécialité, lus dans le dossier via la passerelle.
// La passerelle ne renvoie que Practitioner.name et Practitioner.qualification à ce compte
// (revendication mbolo_elements) : ni téléphone, ni adresse, ni identifiant professionnel.
import type { Practitioner } from 'fhir/r4.js';
import { ClientFhir } from '@mbolo/identite';

export interface Fiche {
  nom: string;
  specialite?: string;
}

export interface Annuaire {
  fiche(praticienId: string): Promise<Fiche | undefined>;
}

export class AnnuaireMemoire implements Annuaire {
  constructor(private readonly fiches: ReadonlyMap<string, Fiche> = new Map()) {}
  async fiche(praticienId: string): Promise<Fiche | undefined> {
    return this.fiches.get(praticienId);
  }
}

export function versFiche(p: Practitioner): Fiche {
  const n = p.name?.[0];
  const nom =
    n?.text ?? [n?.prefix?.join(' '), n?.given?.join(' '), n?.family].filter(Boolean).join(' ');
  const specialite =
    p.qualification?.[0]?.code.text ?? p.qualification?.[0]?.code.coding?.[0]?.display;
  return { nom: nom || 'Professionnel de santé', ...(specialite ? { specialite } : {}) };
}

export class AnnuaireFhir extends ClientFhir implements Annuaire {
  async fiche(praticienId: string): Promise<Fiche | undefined> {
    const r = await this.appeler(`${this.base}/Practitioner/${encodeURIComponent(praticienId)}`);
    if (r.status === 404 || r.status === 410) return undefined;
    if (!r.ok) throw ClientFhir.echec(r, 'Professionnel');
    const p = (await r.json()) as Practitioner;
    return p.resourceType === 'Practitioner' ? versFiche(p) : undefined;
  }
}
