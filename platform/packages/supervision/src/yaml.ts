// Écriture YAML minimale des règles (objets, listes, chaînes, nombres) : chaque chaîne est écrite
// entre guillemets doubles (JSON), valide en YAML ; aucune bibliothèque ajoutée.
type Valeur = string | number | boolean | Valeur[] | { [cle: string]: Valeur | undefined };

const scalaire = (v: string | number | boolean): string =>
  typeof v === 'string' ? JSON.stringify(v) : String(v);

export function versYaml(v: Valeur, retrait = 0): string {
  const marge = ' '.repeat(retrait);
  if (Array.isArray(v)) {
    return v
      .map((e) => {
        if (typeof e === 'object') {
          const [premiere = '', ...suite] = versYaml(e, retrait + 2).split('\n');
          return [`${marge}- ${premiere.trimStart()}`, ...suite].join('\n');
        }
        return `${marge}- ${scalaire(e)}`;
      })
      .join('\n');
  }
  if (typeof v === 'object') {
    return Object.entries(v)
      .filter((e): e is [string, Valeur] => e[1] !== undefined)
      .map(([cle, e]) =>
        typeof e === 'object'
          ? `${marge}${cle}:\n${versYaml(e, retrait + 2)}`
          : `${marge}${cle}: ${scalaire(e)}`,
      )
      .join('\n');
  }
  return `${marge}${scalaire(v)}`;
}

export const EN_TETE =
  '# Fichier généré depuis platform/packages/supervision/src/regles.ts — ne pas modifier à la main.\n' +
  '# pnpm --filter @mbolo/supervision generer\n';
