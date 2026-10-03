// Textes de l'interface rangés par langue (ADR-0025), sans bibliothèque : le budget de poids des
// applications (30 Ko à l'ouverture) ne laisse pas la place à une bibliothèque d'internationalisation.
// - Le catalogue de référence (français) donne les clés : une clé inconnue ne compile pas.
// - Une traduction peut être incomplète : la clé manquante s'affiche dans la langue de référence,
//   jamais vide. Une langue n'est proposée aux patients qu'une fois complète et validée.
// - Les valeurs variables s'écrivent `{nom}` dans le texte ; les pluriels suivent `Intl.PluralRules`.

/** Formes d'un texte qui varie avec un nombre (règles de pluriel de la langue, Unicode CLDR). */
export interface Pluriel {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  /** Forme par défaut, obligatoire : toutes les langues l'ont. */
  other: string;
}

export type Message = string | Pluriel;
export type Catalogue = Readonly<Record<string, Message>>;
/** Valeurs à placer dans le texte ; `nombre` choisit la forme d'un pluriel. */
export type Valeurs = Readonly<Record<string, string | number>>;

export type Traduction<C extends Catalogue> = Readonly<Partial<Record<keyof C, Message>>>;

function reglesDePluriel(langue: string): Intl.PluralRules {
  try {
    return new Intl.PluralRules(langue);
  } catch {
    // Langue inconnue du navigateur (ex. langues locales absentes de son CLDR) : règles du français.
    return new Intl.PluralRules('fr');
  }
}

/**
 * Rend la fonction `t(cle, valeurs)` d'une langue : le texte de `traduction` s'il existe, sinon celui
 * de la `reference`. Une valeur absente laisse `{nom}` tel quel, pour qu'un oubli se voie en test.
 */
export function creerTraducteur<C extends Catalogue>(
  reference: C,
  langue: string,
  traduction: Traduction<C> = {} as Traduction<C>,
): (cle: keyof C & string, valeurs?: Valeurs) => string {
  const regles = reglesDePluriel(langue);
  return (cle, valeurs = {}) => {
    const message: Message = traduction[cle] ?? reference[cle] ?? cle;
    let texte: string;
    if (typeof message === 'string') {
      texte = message;
    } else {
      const nombre = Number(valeurs['nombre'] ?? 0);
      texte = message[regles.select(nombre)] ?? message.other;
    }
    return texte.replace(/\{(\w+)\}/g, (tout, nom: string) =>
      nom in valeurs ? String(valeurs[nom]) : tout,
    );
  };
}

/** Clés de la référence absentes d'une traduction (test de complétude d'une langue). */
export function clesManquantes<C extends Catalogue>(
  reference: C,
  traduction: Traduction<C>,
): string[] {
  return Object.keys(reference).filter((cle) => traduction[cle] === undefined);
}
