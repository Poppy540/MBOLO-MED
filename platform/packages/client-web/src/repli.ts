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

/** Ce que le navigateur dit du réseau (API Network Information, absente sur certains navigateurs). */
export interface InfoReseau {
  /** Mode « économie de données » choisi par la personne sur son téléphone. */
  saveData?: boolean;
  /** Débit estimé : 'slow-2g', '2g', '3g' ou '4g'. */
  effectiveType?: string;
}

/**
 * Faut-il commencer la consultation en audio seulement ? Oui si la personne a choisi d'économiser
 * ses données sur son téléphone, ou si le réseau est en 2G. La vidéo reste activable d'un geste.
 * Sans information (navigateur qui ne la donne pas), la consultation commence en vidéo.
 */
export function economiserDonnees(
  reseau: InfoReseau | undefined = typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { connection?: InfoReseau }).connection,
): boolean {
  if (!reseau) return false;
  return (
    reseau.saveData === true || reseau.effectiveType === '2g' || reseau.effectiveType === 'slow-2g'
  );
}
