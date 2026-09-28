// Prestataire de paiement (ADR-0017) : une interface, pour ne pas dépendre du choix de l'agrégateur.
// En attendant le contrat, un fournisseur simulé (développement et tests uniquement) ; le service
// refuse de démarrer en production avec lui.
import { createHmac, timingSafeEqual } from 'node:crypto';

export type ResultatFournisseur = 'en-attente' | 'reussi' | 'echoue';

export interface DemandeCollecte {
  /** Identifiant de la tentative, choisi par Mbolo Santé : sert aussi de clé d'idempotence. */
  tentative: string;
  montant: number;
  devise: string;
  operateur: string;
  /** Numéro du payeur, transmis au prestataire et jamais conservé par Mbolo Santé. */
  numero: string;
  /** Libellé visible par le payeur : jamais de spécialité, de professionnel ni de patient. */
  libelle: string;
}

export class ErreurFournisseur extends Error {
  constructor() {
    super('Prestataire de paiement indisponible.');
  }
}

export interface Fournisseur {
  readonly nom: string;
  /** Demande la collecte ; le payeur valide ensuite sur son téléphone. Lève `ErreurFournisseur`. */
  initier(d: DemandeCollecte): Promise<void>;
  /** Statut de la tentative chez le prestataire : seule source de vérité. Lève `ErreurFournisseur`. */
  statut(tentative: string): Promise<ResultatFournisseur>;
  /**
   * Vérifie la signature d'une notification et renvoie la tentative concernée, sinon `undefined`.
   * Le contenu n'est jamais cru sur parole : le statut est ensuite relu avec `statut`.
   */
  verifierNotification(
    corps: Buffer,
    entetes: Record<string, string | string[] | undefined>,
    maintenant: Date,
  ): string | undefined;
}

export const LIBELLE = 'Consultation Mbolo Santé';
/** Écart maximal entre l'horodatage signé d'une notification et l'heure du serveur (rejeu refusé). */
export const TOLERANCE_NOTIFICATION_MS = 5 * 60_000;

/** Signature `t=<secondes>,v1=<HMAC-SHA256 hex de "t.corps">` : format du fournisseur simulé. */
export function signer(secret: string, corps: Buffer, t: number): string {
  const mac = createHmac('sha256', secret).update(`${t}.`).update(corps).digest('hex');
  return `t=${t},v1=${mac}`;
}

export function verifierSignature(
  secret: string,
  corps: Buffer,
  entete: string | undefined,
  maintenant: Date,
): boolean {
  const m = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(entete ?? '');
  if (!m) return false;
  const t = Number(m[1]);
  if (Math.abs(maintenant.getTime() - t * 1000) > TOLERANCE_NOTIFICATION_MS) return false;
  const attendu = Buffer.from(signer(secret, corps, t).slice(`t=${t},v1=`.length), 'hex');
  return timingSafeEqual(attendu, Buffer.from(m[2] ?? '', 'hex'));
}

/**
 * Fournisseur simulé : garde les tentatives en mémoire. `conclure` joue le rôle du payeur qui valide
 * (ou refuse) sur son téléphone. Ne garde pas le numéro, comme un vrai prestataire vu de chez nous.
 */
export class FournisseurSimule implements Fournisseur {
  readonly nom = 'simule';
  readonly tentatives = new Map<
    string,
    { resultat: ResultatFournisseur; montant: number; devise: string; libelle: string }
  >();
  /** Pour les tests : le prochain appel échoue comme un prestataire injoignable. */
  indisponible = false;

  constructor(private readonly secret: string) {
    if (secret.length < 32)
      throw new Error('Secret de signature trop court (32 caractères au moins).');
  }

  async initier(d: DemandeCollecte): Promise<void> {
    if (this.indisponible) throw new ErreurFournisseur();
    // Idempotence : une même tentative n'est jamais débitée deux fois.
    if (this.tentatives.has(d.tentative)) return;
    this.tentatives.set(d.tentative, {
      resultat: 'en-attente',
      montant: d.montant,
      devise: d.devise,
      libelle: d.libelle,
    });
  }

  async statut(tentative: string): Promise<ResultatFournisseur> {
    if (this.indisponible) throw new ErreurFournisseur();
    return this.tentatives.get(tentative)?.resultat ?? 'echoue';
  }

  verifierNotification(
    corps: Buffer,
    entetes: Record<string, string | string[] | undefined>,
    maintenant: Date,
  ): string | undefined {
    const entete = entetes['x-signature'];
    if (typeof entete !== 'string' || !verifierSignature(this.secret, corps, entete, maintenant)) {
      return undefined;
    }
    try {
      const { tentative } = JSON.parse(corps.toString('utf8')) as { tentative?: unknown };
      return typeof tentative === 'string' ? tentative : undefined;
    } catch {
      return undefined;
    }
  }

  /** Le payeur valide ou refuse ; renvoie la notification signée que le prestataire enverrait. */
  conclure(
    tentative: string,
    resultat: 'reussi' | 'echoue',
    maintenant = new Date(),
  ): { corps: Buffer; signature: string } {
    const t = this.tentatives.get(tentative);
    if (t) t.resultat = resultat;
    const corps = Buffer.from(JSON.stringify({ tentative, resultat }));
    return {
      corps,
      signature: signer(this.secret, corps, Math.floor(maintenant.getTime() / 1000)),
    };
  }
}
