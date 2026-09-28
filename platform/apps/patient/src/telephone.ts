// Numéro saisi par le patient pour son proche (ADR-0019) : souvent à l'étranger, donc toujours au
// format international. Rien n'est propre à un pays : l'indicatif est celui que la personne saisit.

/** Saisie → format international (+indicatif et chiffres), ou `undefined` si ce n'en est pas un. */
export function numeroInternational(saisie: string): string | undefined {
  const n = saisie.replace(/[\s.()-]/g, '').replace(/^00/, '+');
  return /^\+[1-9][0-9]{7,14}$/.test(n) ? n : undefined;
}
