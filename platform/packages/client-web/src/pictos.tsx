// Pictogrammes des actions clés (ADR-0025), dessinés en SVG dans le code : identiques sur tous les
// téléphones (un émoji change d'un Android à l'autre, ou s'affiche en carré vide sur les anciens),
// aucun fichier à télécharger. Premier jeu simple, à tester avec des patients pendant le test terrain
// avant d'être figé (docs/deploiement/test-terrain-faible-debit.md).
// Un pictogramme accompagne TOUJOURS un texte visible, il ne le remplace jamais : il est décoratif
// pour les lecteurs d'écran (aria-hidden), le texte reste la référence.
import type { JSX } from 'preact';

// Traits sur une grille de 24 × 24, couleur du texte (`currentColor`).
const DESSINS = {
  'rendez-vous': (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  video: (
    <>
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="M15 10l6-3v10l-6-3z" />
    </>
  ),
  audio: <path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7" />,
  raccrocher: <path d="M3 15c5-5 13-5 18 0l-2 3-4-2v-2a10 10 0 0 0-6 0v2l-4 2z" />,
  payer: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
  ordonnance: (
    <>
      <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)" />
      <path d="M9.5 9.5l5 5" />
    </>
  ),
  urgence: <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />,
  partage: (
    <>
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M8.7 10.7l6.6-3.4M8.7 13.3l6.6 3.4" />
    </>
  ),
  proche: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14.2A5 5 0 0 1 21 19" />
    </>
  ),
  'sans-reseau': <path d="M4 20v-3M9 20v-6M14 20v-9M19 20V5M3 4l18 16" />,
} satisfies Record<string, JSX.Element>;

export type NomPicto = keyof typeof DESSINS;
export const PICTOS = Object.keys(DESSINS) as NomPicto[];

/** Pictogramme décoratif, à placer à côté d'un texte visible. */
export function Picto(p: { nom: NomPicto }) {
  return (
    <svg
      class="picto"
      viewBox="0 0 24 24"
      width="1.2em"
      height="1.2em"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {DESSINS[p.nom]}
    </svg>
  );
}
