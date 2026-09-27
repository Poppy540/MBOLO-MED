// Décision d'accès au dossier d'un patient : toujours prise par le service identite (ADR-0009),
// avec le jeton de la personne qui demande. identite consigne chaque décision (AuditEvent) et
// signale les bris de glace pour revue humaine. Ce service ne décide jamais lui-même.

export interface Decision {
  autorise: boolean;
  motif: string;
}

export interface DecideurAcces {
  decider(
    jetonUtilisateur: string,
    patientId: string,
    brisDeGlace?: { motif: string },
  ): Promise<Decision>;
}

export class ErreurDecision extends Error {
  constructor() {
    super('Décision d’accès indisponible.');
    this.name = 'ErreurDecision';
  }
}

export class DecideurIdentite implements DecideurAcces {
  constructor(
    private readonly url: string,
    private readonly appeler: typeof fetch = fetch,
  ) {}

  async decider(jeton: string, patientId: string, brisDeGlace?: { motif: string }) {
    let r: Response;
    try {
      r = await this.appeler(`${this.url}/acces/dossier`, {
        method: 'POST',
        headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
        body: JSON.stringify({ patientId, ...(brisDeGlace ? { brisDeGlace } : {}) }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ErreurDecision();
    }
    // Sans décision explicite, l'accès est refusé (jamais accordé par défaut).
    if (!r.ok) throw new ErreurDecision();
    const d = (await r.json()) as Partial<Decision>;
    return { autorise: d.autorise === true, motif: String(d.motif ?? 'inconnu') };
  }
}
