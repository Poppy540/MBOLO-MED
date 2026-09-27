// Permissions SMART on FHIR v2 des clients de service : « system/<Type>.<cruds> ».
// Ex. « system/Consent.crus » : créer, lire, mettre à jour, rechercher des Consent (jamais supprimer).
// Refus par défaut : un type ou une interaction absents des permissions sont interdits.

export type Interaction = 'c' | 'r' | 'u' | 'd' | 's';

export type Permissions = ReadonlyMap<string, ReadonlySet<Interaction>>;

const SCOPE = /^system\/([A-Z][A-Za-z]{1,63})\.([cruds]{1,5})$/;

/** Lit une liste de permissions séparées par des espaces ; les entrées mal formées sont ignorées. */
export function lirePermissions(texte: string | undefined): Permissions {
  const resultat = new Map<string, Set<Interaction>>();
  for (const morceau of (texte ?? '').split(/\s+/)) {
    const m = SCOPE.exec(morceau);
    if (!m?.[1] || !m[2]) continue;
    const ensemble = resultat.get(m[1]) ?? new Set<Interaction>();
    for (const lettre of m[2]) ensemble.add(lettre as Interaction);
    resultat.set(m[1], ensemble);
  }
  return resultat;
}

export function autorise(p: Permissions, type: string, interaction: Interaction): boolean {
  return p.get(type)?.has(interaction) ?? false;
}
