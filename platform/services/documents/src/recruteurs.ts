// Séparation des tâches (ADR-0026) : qui a recruté une fiche de professionnel, demandé au service
// invitations, qui garde l'auteur de chaque code (décision du porteur de projet du 2026-10-28).
// Sujets techniques seulement. Injoignable → erreur : sans réponse, aucune décision n'est permise.
import type { FournisseurJeton } from '@mbolo/identite';

export interface Recruteurs {
  de(practitionerId: string): Promise<string[]>;
}

export class RecruteursHttp implements Recruteurs {
  constructor(
    private readonly url: string,
    private readonly entetes: FournisseurJeton,
    private readonly appeler: typeof fetch = fetch,
  ) {}

  async de(practitionerId: string): Promise<string[]> {
    const r = await this.appeler(
      `${this.url}/service/professionnels/${encodeURIComponent(practitionerId)}/recruteurs`,
      { headers: await this.entetes(), signal: AbortSignal.timeout(5_000) },
    );
    if (!r.ok) throw new Error(`recruteurs indisponibles (${r.status})`);
    const { recruteurs } = (await r.json()) as { recruteurs?: unknown };
    if (!Array.isArray(recruteurs) || !recruteurs.every((x) => typeof x === 'string')) {
      throw new Error('réponse inattendue du service invitations');
    }
    return recruteurs;
  }
}
