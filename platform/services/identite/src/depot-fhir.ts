// Dépôt des consentements dans le serveur FHIR du dossier médical (ADR-0001, ADR-0009).
// Les consentements sont des ressources Consent du dossier : conservées, versionnées, jamais supprimées.
// Aucun contenu de ressource n'est journalisé ici.
import type { Bundle, Consent } from 'fhir/r4.js';
import type { DepotConsentements } from './consentements.js';

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

const TYPE_FHIR = 'application/fhir+json';
const PAGES_MAX = 20;

const memeOrigine = (a: string, b: string): boolean => {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
};

export class DepotFhir implements DepotConsentements {
  private readonly base: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly o: OptionsDepotFhir) {
    this.base = o.base.replace(/\/+$/, '');
    this.fetch = o.fetch ?? fetch;
  }

  private async appeler(url: string, init: RequestInit = {}): Promise<Response> {
    const entetes = { accept: TYPE_FHIR, ...(await this.o.entetes?.()), ...init.headers };
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

  private static echec(r: Response): ErreurDepot {
    if (r.status === 409 || r.status === 412) {
      return new ErreurDepot('Le consentement a été modifié entre-temps.', 409);
    }
    if (r.status === 400 || r.status === 422) {
      return new ErreurDepot('Consentement refusé par le dossier médical.', 422);
    }
    return new ErreurDepot('Dossier médical indisponible.', 503);
  }

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
    if (r.status !== 201 && r.status !== 200) throw DepotFhir.echec(r);
    return DepotFhir.consent(await r.json());
  }

  async lire(id: string): Promise<Consent | undefined> {
    const r = await this.appeler(`${this.base}/Consent/${encodeURIComponent(id)}`);
    if (r.status === 404 || r.status === 410) return undefined;
    if (!r.ok) throw DepotFhir.echec(r);
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
    if (!r.ok) throw DepotFhir.echec(r);
  }

  async parPatient(patientId: string): Promise<Consent[]> {
    const resultats: Consent[] = [];
    let url: string | undefined =
      `${this.base}/Consent?patient=${encodeURIComponent(`Patient/${patientId}`)}&_count=100`;
    for (let page = 0; url && page < PAGES_MAX; page += 1) {
      // Pas de cache de recherche côté serveur (HAPI le garde 60 s par défaut) : une révocation doit
      // prendre effet immédiatement pour la décision d'accès.
      const r = await this.appeler(url, { headers: { 'cache-control': 'no-cache' } });
      if (!r.ok) throw DepotFhir.echec(r);
      const lot = (await r.json()) as Bundle;
      for (const e of lot.entry ?? []) {
        // Seules les ressources Consent du patient demandé sont retenues (défense en profondeur).
        if (
          e.resource?.resourceType === 'Consent' &&
          e.resource.patient?.reference === `Patient/${patientId}`
        ) {
          resultats.push(e.resource);
        }
      }
      const suivant = lot.link?.find((l) => l.relation === 'next')?.url;
      // On ne suit que des liens vers le même serveur.
      url = suivant && memeOrigine(suivant, this.base) ? suivant : undefined;
    }
    if (url) throw new ErreurDepot('Trop de consentements pour ce patient.', 503);
    return resultats;
  }
}
