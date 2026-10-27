// Annuaire des professionnels : nom et spécialité, lus dans le dossier via la passerelle.
// La passerelle ne renvoie que Practitioner.name, Practitioner.qualification, Practitioner.active et
// Practitioner.extension à ce compte (revendication mbolo_elements) : ni téléphone, ni adresse.
// Seuls les professionnels vérifiés par une personne habilitée, dont l'inscription est encore
// valable, ont une fiche (ADR-0026) : les autres n'apparaissent pas et ne publient rien.
import type { Practitioner } from 'fhir/r4.js';
import { praticienVerifie } from '@mbolo/dossier-fhir';
import { ClientFhir } from '@mbolo/identite';

export interface Fiche {
  nom: string;
  specialite?: string;
}

export interface Annuaire {
  /** Fiche d'un professionnel vérifié à cette date ; undefined sinon (refus par défaut). */
  fiche(praticienId: string, maintenant: Date): Promise<Fiche | undefined>;
}

/** Développement et tests : les fiches données sont celles de professionnels vérifiés. */
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
  async fiche(praticienId: string, maintenant: Date): Promise<Fiche | undefined> {
    // Sans cache : une suspension doit retirer le professionnel de l'annuaire sans attendre.
    const r = await this.appeler(`${this.base}/Practitioner/${encodeURIComponent(praticienId)}`, {
      headers: { 'cache-control': 'no-cache' },
    });
    if (r.status === 404 || r.status === 410) return undefined;
    if (!r.ok) throw ClientFhir.echec(r, 'Professionnel');
    const p = (await r.json()) as Practitioner;
    return p.resourceType === 'Practitioner' && praticienVerifie(p, maintenant)
      ? versFiche(p)
      : undefined;
  }
}
