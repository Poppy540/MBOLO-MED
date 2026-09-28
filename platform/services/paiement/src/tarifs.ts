// Grille de prix et paramètres du pays déployé (ADR-0017). Rien n'est codé en dur pour le Gabon : la
// devise, les prix, les opérateurs et l'indicatif viennent de la configuration du déploiement.
// Le montant est toujours fixé ici, par le serveur, jamais reçu du navigateur.

export class ErreurTarifs extends Error {}

export const TYPES_CONSULTATION = ['generaliste', 'specialiste'] as const;
export type TypeConsultation = (typeof TYPES_CONSULTATION)[number];

export interface Tarifs {
  /** Devise ISO 4217, ex. XAF (franc CFA d'Afrique centrale). */
  devise: string;
  /** Montant par type de consultation, en unités entières de la devise. */
  prix: Record<TypeConsultation, number>;
  /** Opérateurs de mobile money proposés dans le pays, ex. airtel, moov. */
  operateurs: readonly string[];
  /** Indicatif téléphonique du pays, sans « + », ex. 241. */
  indicatif: string;
}

const OPERATEUR = /^[a-z][a-z0-9-]{1,30}$/;

export function verifierTarifs(t: Tarifs): Tarifs {
  if (!/^[A-Z]{3}$/.test(t.devise)) throw new ErreurTarifs('Devise invalide (code ISO 4217).');
  for (const type of TYPES_CONSULTATION) {
    const p = t.prix[type];
    if (!Number.isSafeInteger(p) || p <= 0) {
      throw new ErreurTarifs(`Prix invalide pour « ${type} » (entier positif).`);
    }
  }
  if (t.operateurs.length === 0 || !t.operateurs.every((o) => OPERATEUR.test(o))) {
    throw new ErreurTarifs('Opérateurs invalides.');
  }
  if (!/^[1-9]\d{0,3}$/.test(t.indicatif)) throw new ErreurTarifs('Indicatif invalide.');
  return t;
}

/** Lit la grille depuis l'environnement (JSON du déploiement), vérifiée avant usage. */
export function tarifsDepuis(env: Record<string, string | undefined>): Tarifs {
  let prix: unknown;
  try {
    prix = JSON.parse(env['PAIEMENT_PRIX'] ?? '');
  } catch {
    throw new ErreurTarifs('PAIEMENT_PRIX doit être un objet JSON, ex. {"generaliste":…}.');
  }
  return verifierTarifs({
    devise: env['PAIEMENT_DEVISE'] ?? '',
    prix: prix as Record<TypeConsultation, number>,
    operateurs: (env['PAIEMENT_OPERATEURS'] ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    indicatif: env['PAIEMENT_INDICATIF'] ?? '',
  });
}

/**
 * Numéro du portefeuille qui paie, au format international (+<indicatif><numéro>) et du pays déployé.
 * Il n'est ni stocké ni journalisé : seuls les deux derniers chiffres peuvent être montrés au payeur.
 */
export function normaliserNumero(numero: string, indicatif: string): string | undefined {
  const n = numero.replace(/[\s.-]/g, '');
  if (!/^\+\d{8,15}$/.test(n) || !n.startsWith(`+${indicatif}`)) return undefined;
  return n;
}
