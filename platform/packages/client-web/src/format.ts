// Dates au fuseau et dans la langue du pays déployé (le Gabon d'abord ; paramétrable).

/** Format court : « mer. 01/10 à 09:00 ». */
export function quand(iso: string, fuseau: string, langue: string): string {
  const t = new Date(iso);
  const jour = new Intl.DateTimeFormat(langue, {
    timeZone: fuseau,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(t);
  const heure = new Intl.DateTimeFormat(langue, {
    timeZone: fuseau,
    hour: '2-digit',
    minute: '2-digit',
  }).format(t);
  return `${jour} à ${heure}`;
}

/** Décalage (ms) du fuseau par rapport à UTC à l'instant t. */
function decalage(t: number, fuseau: string): number {
  const parties = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(t);
  const v = (type: string) => Number(parties.find((p) => p.type === type)?.value);
  return Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute')) - t;
}

/**
 * Date et heure saisies dans le fuseau du pays (« 2026-10-01 », « 09:00 ») → instant ISO 8601.
 * Deux passes pour les changements d'heure (pays avec heure d'été).
 */
export function versInstant(date: string, heure: string, fuseau: string): string {
  const [a, m, j] = date.split('-').map(Number);
  const [h, mi] = heure.split(':').map(Number);
  if ([a, m, j, h, mi].some((x) => x === undefined || Number.isNaN(x))) {
    throw new Error('Date ou heure invalide.');
  }
  const local = Date.UTC(a ?? 0, (m ?? 1) - 1, j ?? 1, h ?? 0, mi ?? 0);
  let t = local - decalage(local, fuseau);
  t = local - decalage(t, fuseau);
  return new Date(t).toISOString();
}
