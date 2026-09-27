// Gabarits de notification approuvés (ADR-0012). Liste fermée : aucun texte libre, aucune donnée
// de santé (ni motif, ni spécialité, ni nom du professionnel). Un SMS : 160 caractères au plus.
// Toute modification est relue par le porteur de projet avant la mise en production.

export const GABARITS = {
  'rendez-vous-annule':
    'Mbolo Santé : votre rendez-vous du {date} à {heure} est annulé. Ouvrez l’application pour en choisir un autre.',
  'rendez-vous-reporte':
    'Mbolo Santé : votre rendez-vous est déplacé au {date} à {heure}. Détails dans l’application.',
} as const;

export type Gabarit = keyof typeof GABARITS;

export const estGabarit = (x: string): x is Gabarit => Object.hasOwn(GABARITS, x);

/** Variables autorisées : une date (JJ/MM) et une heure (HH:MM), calculées à partir d'un instant. */
export interface Variables {
  /** Instant du rendez-vous (ISO 8601). */
  instant: string;
}

/** Fuseau du Gabon (UTC+1, sans heure d'été). */
const FUSEAU = 'Africa/Libreville';

export function rediger(g: Gabarit, v: Variables): string {
  const t = new Date(v.instant);
  if (Number.isNaN(t.getTime())) throw new Error('Instant invalide.');
  const date = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU,
    day: '2-digit',
    month: '2-digit',
  }).format(t);
  const heure = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU,
    hour: '2-digit',
    minute: '2-digit',
  }).format(t);
  return GABARITS[g].replace('{date}', date).replace('{heure}', heure);
}
