// Accès HTTP au dossier médical (via la passerelle, ADR-0010) partagé par les dépôts du service :
// jeton de service, délai maximal, erreurs traduites sans détail du serveur, pagination bornée.
import type { Bundle, FhirResource } from 'fhir/r4.js';

export interface OptionsDepotFhir {
  /** URL de base du serveur FHIR, ex. https://fhir.mbolo-sante.example/fhir */
  base: string;
  /** En-têtes d'authentification (jeton SMART du service), fournis au moment de l'appel. */
  entetes?: () => Promise<Record<string, string>>;
  /** Délai maximal d'une requête, en millisecondes (défaut : 5 000). */
  delaiMs?: number;
  /** Pour les tests. */
  fetch?: typeof fetch;
}

/** Erreur du serveur FHIR, avec un statut HTTP à renvoyer au client (jamais le détail du serveur). */
export class ErreurDepot extends Error {
  constructor(
    message: string,
    readonly statut: 409 | 422 | 503,
  ) {
    super(message);
    this.name = 'ErreurDepot';
  }
}

export const TYPE_FHIR = 'application/fhir+json';
export const PAGES_MAX = 20;

export const memeOrigine = (a: string, b: string): boolean => {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
};

export abstract class ClientFhir {
  protected readonly base: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly o: OptionsDepotFhir) {
    this.base = o.base.replace(/\/+$/, '');
    this.fetch = o.fetch ?? fetch;
  }

  protected async appeler(url: string, init: RequestInit = {}): Promise<Response> {
    let authentification: Record<string, string> | undefined;
    try {
      authentification = await this.o.entetes?.();
    } catch {
      throw new ErreurDepot('Dossier médical indisponible.', 503);
    }
    const entetes = { accept: TYPE_FHIR, ...authentification, ...init.headers };
    try {
      return await this.fetch(url, {
        ...init,
        headers: entetes,
        signal: AbortSignal.timeout(this.o.delaiMs ?? 5_000),
      });
    } catch {
      throw new ErreurDepot('Dossier médical indisponible.', 503);
    }
  }

  /** Traduit un refus du serveur ; `ressource` nomme la ressource dans le message (ex. « Consentement »). */
  protected static echec(r: Response, ressource: string): ErreurDepot {
    if (r.status === 409 || r.status === 412) {
      return new ErreurDepot(`${ressource} modifié entre-temps.`, 409);
    }
    if (r.status === 400 || r.status === 422) {
      return new ErreurDepot(`${ressource} refusé par le dossier médical.`, 422);
    }
    return new ErreurDepot('Dossier médical indisponible.', 503);
  }

  /**
   * Recherche paginée, sans cache côté serveur (HAPI garde les résultats 60 s par défaut) et en ne
   * suivant que des liens vers le même serveur ; `garder` filtre chaque entrée (défense en profondeur).
   */
  protected async rechercher<T extends FhirResource>(
    premiereUrl: string,
    ressource: string,
    garder: (r: FhirResource) => r is T,
  ): Promise<T[]> {
    const resultats: T[] = [];
    let url: string | undefined = premiereUrl;
    for (let page = 0; url && page < PAGES_MAX; page += 1) {
      const r = await this.appeler(url, { headers: { 'cache-control': 'no-cache' } });
      if (!r.ok) throw ClientFhir.echec(r, ressource);
      const lot = (await r.json()) as Bundle;
      for (const e of lot.entry ?? []) {
        if (e.resource && garder(e.resource)) resultats.push(e.resource);
      }
      const suivant = lot.link?.find((l) => l.relation === 'next')?.url;
      url = suivant && memeOrigine(suivant, this.base) ? suivant : undefined;
    }
    if (url) throw new ErreurDepot('Trop de résultats dans le dossier médical.', 503);
    return resultats;
  }
}
