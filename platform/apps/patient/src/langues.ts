// Langues proposées au patient (ADR-0025). La liste dépend du pays et se règle au déploiement
// (VITE_LANGUES), jamais dans le code. Une langue n'est proposée que si son catalogue existe : on ne
// montre pas « Fang » pour afficher ensuite du français. Le choix est gardé sur le téléphone (ce n'est
// pas une donnée de santé).

export interface Langue {
  /** Code BCP 47, aussi posé sur la page (`lang`, WCAG 3.1.1). */
  code: string;
  /** Nom écrit dans la langue elle-même (« Français », « Fang »…). */
  nom: string;
}

export const LANGUE_DE_REFERENCE: Langue = { code: 'fr', nom: 'Français' };
const CLE_STOCKAGE = 'mbolo.langue';
const CLE_ENVOYEE = 'mbolo.langue.envoyee';

/**
 * « code:Nom » séparés par des virgules → langues proposées, dans l'ordre donné, limitées à celles
 * qui ont un catalogue. Une entrée mal formée ou en double est ignorée ; sans langue valable, le
 * français (langue de référence) reste proposé.
 */
export function languesProposees(texte: string, catalogues: readonly string[]): Langue[] {
  const langues: Langue[] = [];
  for (const entree of texte.split(',')) {
    const i = entree.indexOf(':');
    const code = entree.slice(0, i).trim();
    const nom = entree.slice(i + 1).trim();
    const valide =
      i > 0 &&
      codeValide(code) &&
      nom.length > 0 &&
      nom.length <= 30 &&
      catalogues.includes(code) &&
      !langues.some((l) => l.code === code);
    if (valide) langues.push({ code, nom });
  }
  return langues.length > 0 ? langues : [LANGUE_DE_REFERENCE];
}

/**
 * Code BCP 47 simple : langue en 2 ou 3 lettres, puis sous-étiquettes de 1 à 8 caractères (« fr »,
 * « fr-x-fictif »). Vérifié morceau par morceau, sans expression régulière à répétition imbriquée.
 */
function codeValide(code: string): boolean {
  const [langue, ...suite] = code.split('-');
  return (
    /^[a-z]{2,3}$/.test(langue ?? '') &&
    suite.length <= 4 &&
    suite.every((s) => /^[A-Za-z0-9]{1,8}$/.test(s))
  );
}

/** Langue gardée sur le téléphone si elle est encore proposée, sinon la première de la liste. */
export function langueGardee(stockage: Storage | undefined, langues: readonly Langue[]): string {
  let gardee: string | null = null;
  try {
    gardee = stockage?.getItem(CLE_STOCKAGE) ?? null;
  } catch {
    // Stockage refusé (navigation privée, réglages) : langue par défaut.
  }
  const premiere = langues[0]?.code ?? LANGUE_DE_REFERENCE.code;
  return langues.some((l) => l.code === gardee) ? (gardee ?? premiere) : premiere;
}

export function garderLangue(stockage: Storage | undefined, code: string): void {
  try {
    stockage?.setItem(CLE_STOCKAGE, code);
  } catch {
    // Sans stockage, le choix vaut pour cette visite seulement.
  }
}

/**
 * Langue à enregistrer dans le dossier du patient connecté (ADR-0025), pour que ses SMS soient
 * écrits dans cette langue : seulement une langue choisie par le patient (gardée sur le téléphone)
 * et encore proposée, et une seule fois par session (`session` : sessionStorage). Sans choix, rien
 * n'est envoyé et les SMS suivent la langue du pays.
 */
export function langueAEnvoyer(
  local: Storage | undefined,
  session: Storage | undefined,
  langues: readonly Langue[],
): string | undefined {
  try {
    const choisie = local?.getItem(CLE_STOCKAGE);
    if (!choisie || !langues.some((l) => l.code === choisie)) return undefined;
    return session?.getItem(CLE_ENVOYEE) === choisie ? undefined : choisie;
  } catch {
    return undefined;
  }
}

export function marquerEnvoyee(session: Storage | undefined, code: string): void {
  try {
    session?.setItem(CLE_ENVOYEE, code);
  } catch {
    // Sans stockage de session, la langue sera renvoyée à la prochaine ouverture.
  }
}
