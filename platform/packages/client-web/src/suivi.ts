// Suivi d'un état côté serveur (paiement en attente…) économe en données mobiles (faible débit).
// - Une seule requête à la fois : la suivante part après la réponse (sur une 3G lente, une requête
//   peut durer plus longtemps que l'intervalle ; avec `setInterval`, elles s'empileraient).
// - Le rythme ralentit : rapide au début, quand la réponse est probable, puis plus lent.
// - Rien n'est demandé quand l'application est en arrière-plan (le patient valide le paiement sur
//   l'écran de son opérateur) ; une vérification part dès qu'elle revient au premier plan.

/** Étape du rythme : un intervalle, valable jusqu'à un temps écoulé depuis le début du suivi. */
export interface EtapeSuivi {
  /** Temps écoulé (ms) jusqu'auquel cet intervalle s'applique ; absent pour la dernière étape. */
  jusqua?: number;
  toutesLes: number;
}

/** Toutes les 3 s pendant la première minute, puis toutes les 10 s. */
export const RYTHME_SUIVI: readonly EtapeSuivi[] = [
  { jusqua: 60_000, toutesLes: 3_000 },
  { toutesLes: 10_000 },
];

/** Ce qu'il faut de la page pour savoir si l'application est visible (`document` en vrai). */
export interface PageVisible {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', ecouteur: () => void): void;
  removeEventListener(type: 'visibilitychange', ecouteur: () => void): void;
}

export interface OptionsSuivi {
  rythme?: readonly EtapeSuivi[];
  page?: PageVisible;
}

/**
 * Appelle `verifier` selon le rythme, jusqu'à ce qu'elle rende `true` ou que le suivi soit arrêté.
 * Une erreur (réseau coupé, délai dépassé) n'arrête pas le suivi : on réessaie au tour suivant.
 * Rend la fonction qui arrête le suivi.
 */
export function suivre(verifier: () => Promise<boolean>, options: OptionsSuivi = {}): () => void {
  const rythme = options.rythme ?? RYTHME_SUIVI;
  const page = options.page ?? (typeof document === 'undefined' ? undefined : document);
  const debut = Date.now();
  let arrete = false;
  let enCours = false;
  let minuterie: ReturnType<typeof setTimeout> | undefined;

  const intervalle = (): number => {
    const ecoule = Date.now() - debut;
    const etape = rythme.find((e) => e.jusqua === undefined || ecoule < e.jusqua) ?? rythme.at(-1);
    // Rythme vide (erreur de configuration) : 10 s, le rythme lent par défaut.
    return etape?.toutesLes ?? 10_000;
  };

  const planifier = (): void => {
    clearTimeout(minuterie);
    minuterie = undefined;
    // En arrière-plan, rien n'est planifié : le retour au premier plan relance le suivi.
    if (arrete || page?.hidden) return;
    minuterie = setTimeout(() => void tour(), intervalle());
  };

  async function tour(): Promise<void> {
    minuterie = undefined;
    if (arrete || enCours || page?.hidden) return;
    enCours = true;
    let fini = false;
    try {
      fini = await verifier();
    } catch {
      // Réseau : on réessaie au tour suivant.
    }
    enCours = false;
    if (fini) arreter();
    else planifier();
  }

  const auRetour = (): void => {
    if (arrete || page?.hidden || enCours) return;
    clearTimeout(minuterie);
    void tour();
  };

  function arreter(): void {
    arrete = true;
    clearTimeout(minuterie);
    page?.removeEventListener('visibilitychange', auRetour);
  }

  page?.addEventListener('visibilitychange', auRetour);
  planifier();
  return arreter;
}
