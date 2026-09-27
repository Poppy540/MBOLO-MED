// Repli audio automatique (ADR-0002, ADR-0011) : si la qualité de connexion reste mauvaise
// pendant `seuilMs`, ou si la connexion est perdue, la vidéo est coupée pour garder la voix.

export type Qualite = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

export class DecisionRepli {
  private mauvaiseDepuis: number | undefined;

  constructor(private readonly seuilMs = 5_000) {}

  /** Renvoie true quand il faut passer en audio seulement. */
  observer(qualite: Qualite, maintenant: number): boolean {
    if (qualite === 'lost') return true;
    if (qualite !== 'poor') {
      this.mauvaiseDepuis = undefined;
      return false;
    }
    this.mauvaiseDepuis ??= maintenant;
    return maintenant - this.mauvaiseDepuis >= this.seuilMs;
  }
}
