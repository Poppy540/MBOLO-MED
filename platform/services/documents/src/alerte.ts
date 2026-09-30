// Alerte à l'ancien numéro quand le numéro change après une perte (ADR-0023) : le service
// notifications lit ce numéro dans le dossier, avant la mise à jour. Ni numéro ni texte libre.
import type { FournisseurJeton } from '@mbolo/identite';
import type { AlerteNumero } from './perte.js';

export class AlerteNumeroHttp implements AlerteNumero {
  constructor(
    private readonly url: string,
    private readonly entetes: FournisseurJeton,
    private readonly appeler: typeof fetch = fetch,
  ) {}

  async numeroChange(patientId: string): Promise<'envoyee' | 'ignoree-sans-numero' | 'echec'> {
    try {
      const r = await this.appeler(`${this.url}/numero-change`, {
        method: 'POST',
        headers: { ...(await this.entetes()), 'content-type': 'application/json' },
        body: JSON.stringify({ patientId }),
        signal: AbortSignal.timeout(5_000),
      });
      if (r.status !== 202) return 'echec';
      const { resultat } = (await r.json()) as { resultat?: string };
      return resultat === 'envoyee' || resultat === 'ignoree-sans-numero' ? resultat : 'echec';
    } catch {
      return 'echec';
    }
  }
}
