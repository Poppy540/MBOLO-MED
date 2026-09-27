// Mode hors ligne (réseau absent ou coûteux) :
// - service worker : l'application s'ouvre sans réseau (voir public/sw.js des applications) ;
// - dernière liste de rendez-vous connue, réduite à l'identifiant, à l'horaire et à la durée :
//   ni professionnel, ni patient, ni motif. Effacée à la déconnexion.

export interface RendezVousHorsLigne {
  id: string;
  debut: string;
  dureeMinutes: number;
}

export interface Stockage {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
  removeItem(cle: string): void;
}

const CLE = 'mbolo.rendez-vous';

/** Garde la liste (champs minimaux seulement) ; un stockage indisponible est ignoré. */
export function retenirRendezVous(
  s: Stockage,
  liste: readonly RendezVousHorsLigne[],
  maintenant: Date = new Date(),
): void {
  const minimale = liste.map(({ id, debut, dureeMinutes }) => ({ id, debut, dureeMinutes }));
  try {
    s.setItem(CLE, JSON.stringify({ date: maintenant.toISOString(), liste: minimale }));
  } catch {
    // Stockage plein ou interdit (navigation privée) : le mode hors ligne est simplement absent.
  }
}

export function rendezVousRetenus(
  s: Stockage,
): { date: string; liste: RendezVousHorsLigne[] } | undefined {
  try {
    const brut = s.getItem(CLE);
    return brut ? (JSON.parse(brut) as { date: string; liste: RendezVousHorsLigne[] }) : undefined;
  } catch {
    return undefined;
  }
}

export function oublierRendezVous(s: Stockage): void {
  try {
    s.removeItem(CLE);
  } catch {
    // Rien à effacer.
  }
}

/** Erreur réseau (hors ligne) plutôt que refus du serveur. */
export const estHorsLigne = (e: unknown): boolean => e instanceof TypeError;

/** Enregistre le service worker de l'application (ignoré si le navigateur ne le permet pas). */
export function activerHorsLigne(): void {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }
}
