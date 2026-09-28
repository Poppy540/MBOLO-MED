// Paiement d'une réservation (ADR-0017), par le service `paiement` : même jeton de service que pour
// le dossier (audience mbolo-paiement-api). Ce service ne connaît ni le montant à l'avance ni le
// moyen de paiement : il demande la création du paiement et demande seulement « payé ou non ».
import { ErreurDepot } from '@mbolo/identite';

export interface InfoPaiement {
  id: string;
  montant: number;
  devise: string;
}

/** Type de consultation facturé : médecine générale en vague 1 (ADR-0017, grille du pays). */
export type TypeConsultation = 'generaliste' | 'specialiste';

export interface Paiements {
  /** Crée (ou retrouve) le paiement du rendez-vous. Lève `ErreurDepot` 503 si le service est injoignable. */
  creer(d: { reference: string; sujet: string; type: TypeConsultation }): Promise<InfoPaiement>;
  /** Payé ou non ; lève `ErreurDepot` 503 si le service est injoignable (jamais « non » par défaut). */
  estPaye(reference: string): Promise<boolean>;
}

const indisponible = () => new ErreurDepot('Paiement momentanément indisponible.', 503);

export class PaiementsHttp implements Paiements {
  constructor(
    private readonly o: {
      /** URL du service de paiement, ex. http://127.0.0.1:3008 */
      url: string;
      entetes: () => Promise<Record<string, string>>;
      fetch?: typeof fetch;
    },
  ) {}

  private async appeler(chemin: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await (this.o.fetch ?? fetch)(`${this.o.url}${chemin}`, {
        ...init,
        headers: {
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...(await this.o.entetes()),
        },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw indisponible();
    }
  }

  async creer(d: {
    reference: string;
    sujet: string;
    type: TypeConsultation;
  }): Promise<InfoPaiement> {
    const r = await this.appeler('/paiements', { method: 'POST', body: JSON.stringify(d) });
    if (r.status !== 201) throw indisponible();
    const p = (await r.json()) as Partial<InfoPaiement>;
    if (typeof p.id !== 'string' || typeof p.montant !== 'number' || typeof p.devise !== 'string') {
      throw indisponible();
    }
    return { id: p.id, montant: p.montant, devise: p.devise };
  }

  async estPaye(reference: string): Promise<boolean> {
    const r = await this.appeler(`/rendez-vous/${encodeURIComponent(reference)}/paiement`);
    if (!r.ok) throw indisponible();
    return ((await r.json()) as { paye?: unknown }).paye === true;
  }
}

/** Paiements en mémoire (tests) : `payer` joue le patient qui paie. */
export class PaiementsMemoire implements Paiements {
  readonly crees = new Map<string, { sujet: string; type: TypeConsultation }>();
  readonly payes = new Set<string>();
  indisponible = false;

  async creer(d: {
    reference: string;
    sujet: string;
    type: TypeConsultation;
  }): Promise<InfoPaiement> {
    if (this.indisponible) throw indisponible();
    this.crees.set(d.reference, { sujet: d.sujet, type: d.type });
    return { id: `paiement-${d.reference}`, montant: 10_000, devise: 'XAF' };
  }

  async estPaye(reference: string): Promise<boolean> {
    if (this.indisponible) throw indisponible();
    return this.payes.has(reference);
  }

  payer(reference: string): void {
    this.payes.add(reference);
  }
}
