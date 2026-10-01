// Focus au changement d'écran (WCAG 2.4.3, ordre du focus). Dans une application d'une seule page,
// le bouton qui ouvre un écran disparaît avec l'ancien : sans rien faire, le focus retombe au début
// de la page, et un lecteur d'écran n'annonce pas le nouvel écran. On place donc le focus sur le
// titre (`h2`) du nouvel écran, y compris s'il arrive plus tard (écran chargé à la demande).
import { useEffect, useRef } from 'preact/hooks';

/** Délai au-delà duquel on renonce à attendre le titre (écran qui ne charge pas). */
const ATTENTE_MAX_MS = 5000;

/**
 * Place le focus sur le premier `h2` de `racine`, dès qu'il existe. Rend une fonction qui arrête
 * l'attente (nouvel écran entre-temps).
 */
export function titreAuFocus(racine: ParentNode): () => void {
  const essayer = (): boolean => {
    const titre = racine.querySelector<HTMLElement>('h2');
    if (!titre) return false;
    // Un titre n'est pas atteignable au clavier : -1 le rend focalisable par programme seulement.
    if (!titre.hasAttribute('tabindex')) titre.setAttribute('tabindex', '-1');
    titre.focus();
    return true;
  };
  if (essayer()) return () => {};
  const observateur = new MutationObserver(() => {
    if (essayer()) arreter();
  });
  const minuterie = setTimeout(arreter, ATTENTE_MAX_MS);
  function arreter(): void {
    observateur.disconnect();
    clearTimeout(minuterie);
  }
  observateur.observe(racine, { childList: true, subtree: true });
  return arreter;
}

/**
 * À chaque changement de `ecran` (sauf au premier affichage, pour ne pas déplacer le focus à
 * l'ouverture de l'application), place le focus sur le titre du nouvel écran dans `<main>`.
 */
export function useTitreAuFocus(ecran: string): void {
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    return titreAuFocus(document.querySelector('main') ?? document.body);
  }, [ecran]);
}
