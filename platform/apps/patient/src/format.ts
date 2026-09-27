// Dates au fuseau et dans la langue du pays déployé, en format court : « mer. 01/10 à 09:00 ».

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
