import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { suivre, type PageVisible } from './suivi.js';

/** Page simulée : visible ou non, avec l'événement `visibilitychange`. */
class FaussePage extends EventTarget implements PageVisible {
  hidden = false;
  cacher(cachee: boolean): void {
    this.hidden = cachee;
    this.dispatchEvent(new Event('visibilitychange'));
  }
  override addEventListener(type: 'visibilitychange', ecouteur: () => void): void {
    super.addEventListener(type, ecouteur);
  }
  override removeEventListener(type: 'visibilitychange', ecouteur: () => void): void {
    super.removeEventListener(type, ecouteur);
  }
}

/** Laisse s'exécuter les promesses en attente (réponse d'une vérification). */
const reponses = () => vi.advanceTimersByTimeAsync(0);

describe('suivre (suivi économe en données)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('vérifie toutes les 3 s pendant la première minute, puis toutes les 10 s', async () => {
    const verifier = vi.fn(async () => false);
    const arreter = suivre(verifier, { page: new FaussePage() });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(verifier).toHaveBeenCalledTimes(20);
    await vi.advanceTimersByTimeAsync(14 * 60_000);
    // 15 minutes : 20 + 84 vérifications, au lieu de 300 toutes les 3 s.
    expect(verifier).toHaveBeenCalledTimes(104);
    arreter();
  });

  it('n’envoie jamais une vérification avant la réponse à la précédente', async () => {
    let enCours = 0;
    let auPlus = 0;
    // Réseau lent : chaque réponse met 20 s à arriver, bien plus que l'intervalle de 3 s.
    const verifier = vi.fn(async () => {
      enCours += 1;
      auPlus = Math.max(auPlus, enCours);
      await new Promise((ok) => setTimeout(ok, 20_000));
      enCours -= 1;
      return false;
    });
    const arreter = suivre(verifier, { page: new FaussePage() });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(auPlus).toBe(1);
    // 3 s d'attente + 20 s de réponse : 2 vérifications terminées en une minute, la 3e en cours.
    expect(verifier).toHaveBeenCalledTimes(3);
    arreter();
  });

  it('s’arrête quand la vérification dit que c’est fini, ou quand on l’arrête', async () => {
    const fini = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    suivre(fini, { page: new FaussePage() });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fini).toHaveBeenCalledTimes(2);

    const verifier = vi.fn(async () => false);
    const arreter = suivre(verifier, { page: new FaussePage() });
    await vi.advanceTimersByTimeAsync(3_000);
    arreter();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(verifier).toHaveBeenCalledTimes(1);
  });

  it('continue après une erreur réseau', async () => {
    const verifier = vi
      .fn()
      .mockRejectedValueOnce(new Error('Pas de réseau.'))
      .mockResolvedValueOnce(true);
    suivre(verifier, { page: new FaussePage() });
    await vi.advanceTimersByTimeAsync(6_000);
    expect(verifier).toHaveBeenCalledTimes(2);
  });

  it('ne demande rien en arrière-plan et vérifie dès le retour au premier plan', async () => {
    const page = new FaussePage();
    const verifier = vi.fn(async () => false);
    const arreter = suivre(verifier, { page });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(verifier).toHaveBeenCalledTimes(1);

    // Le patient part valider sur l'écran de son opérateur.
    page.cacher(true);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(verifier).toHaveBeenCalledTimes(1);

    // Il revient : vérification immédiate, puis le rythme reprend.
    page.cacher(false);
    await reponses();
    expect(verifier).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(verifier).toHaveBeenCalledTimes(3);
    arreter();
  });
});
