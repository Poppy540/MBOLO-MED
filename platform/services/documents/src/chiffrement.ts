// Chiffrement par enveloppe (ADR-0015) : chaque document a sa propre clé de données (AES-256-GCM),
// elle-même chiffrée (« enveloppée ») par une clé maître gardée hors du stockage. Détruire la clé
// d'un document le rend illisible pour toujours. Uniquement node:crypto.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 1;
const IV = 12;
const TAG = 16;

/** Clé maître : KMS de l'hébergeur ou coffre-fort ; elle ne quitte jamais son fournisseur idéalement. */
export interface CleMaitre {
  envelopper(cle: Buffer): Promise<Buffer>;
  desenvelopper(enveloppe: Buffer): Promise<Buffer>;
}

export class ErreurChiffrement extends Error {}

function chiffrerGcm(cle: Buffer, clair: Buffer, contexte: Buffer): Buffer {
  const iv = randomBytes(IV);
  const c = createCipheriv('aes-256-gcm', cle, iv);
  c.setAAD(contexte);
  const chiffre = Buffer.concat([c.update(clair), c.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, c.getAuthTag(), chiffre]);
}

function dechiffrerGcm(cle: Buffer, paquet: Buffer, contexte: Buffer): Buffer {
  if (paquet.length < 1 + IV + TAG || paquet[0] !== VERSION) {
    throw new ErreurChiffrement('Format chiffré inconnu.');
  }
  const d = createDecipheriv('aes-256-gcm', cle, paquet.subarray(1, 1 + IV), {
    authTagLength: TAG,
  });
  d.setAAD(contexte);
  d.setAuthTag(paquet.subarray(1 + IV, 1 + IV + TAG));
  try {
    return Buffer.concat([d.update(paquet.subarray(1 + IV + TAG)), d.final()]);
  } catch {
    // Mauvaise clé, contenu altéré ou échangé avec celui d'un autre document.
    throw new ErreurChiffrement('Contenu illisible ou altéré.');
  }
}

/**
 * Clé maître locale (32 octets, depuis le coffre-fort) : pour le développement et en attendant le
 * KMS de l'hébergeur. Même interface, remplaçable sans toucher aux documents déjà chiffrés si l'on
 * ré-enveloppe leurs clés.
 */
export class CleMaitreLocale implements CleMaitreNommee {
  private readonly cle: Buffer;

  constructor(
    cleBase64: string,
    readonly identifiant = 'locale',
  ) {
    const cle = Buffer.from(cleBase64, 'base64');
    if (cle.length !== 32) throw new ErreurChiffrement('La clé maître doit faire 32 octets.');
    this.cle = cle;
  }

  async envelopper(cle: Buffer): Promise<Buffer> {
    return chiffrerGcm(this.cle, cle, Buffer.from('mbolo-cle-document'));
  }

  async desenvelopper(enveloppe: Buffer): Promise<Buffer> {
    return dechiffrerGcm(this.cle, enveloppe, Buffer.from('mbolo-cle-document'));
  }
}

/** Clé maître nommée : l'identifiant est écrit dans chaque enveloppe (rotation, ADR-0016). */
export interface CleMaitreNommee extends CleMaitre {
  readonly identifiant: string;
}

const ENTETE_TROUSSEAU = 0x4b;
const IDENTIFIANT = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Trousseau de clés maîtres (ADR-0016) : enveloppe avec la clé actuelle en écrivant son identifiant
 * devant l'enveloppe ; désenveloppe avec la clé qui a servi, actuelle ou ancienne. Les enveloppes
 * écrites avant le trousseau (clé locale seule, sans identifiant) restent lisibles par une ancienne
 * clé déclarée « historique ».
 */
export class TrousseauCles implements CleMaitre {
  private readonly parIdentifiant = new Map<string, CleMaitreNommee>();

  constructor(
    readonly actuelle: CleMaitreNommee,
    anciennes: readonly CleMaitreNommee[] = [],
    /** Clé des enveloppes sans identifiant (écrites avant le trousseau). */
    private readonly historique?: CleMaitreNommee,
  ) {
    for (const c of [actuelle, ...anciennes, ...(historique ? [historique] : [])]) {
      if (!IDENTIFIANT.test(c.identifiant)) {
        throw new ErreurChiffrement('Identifiant de clé maître invalide.');
      }
      this.parIdentifiant.set(c.identifiant, c);
    }
  }

  async envelopper(cle: Buffer): Promise<Buffer> {
    const id = Buffer.from(this.actuelle.identifiant, 'utf8');
    return Buffer.concat([
      Buffer.from([ENTETE_TROUSSEAU, id.length]),
      id,
      await this.actuelle.envelopper(cle),
    ]);
  }

  /** Identifiant de la clé maître qui a produit l'enveloppe (`undefined` : historique). */
  static identifiantDe(enveloppe: Buffer): string | undefined {
    if (enveloppe[0] !== ENTETE_TROUSSEAU || enveloppe.length < 2) return undefined;
    return enveloppe.subarray(2, 2 + (enveloppe[1] ?? 0)).toString('utf8');
  }

  async desenvelopper(enveloppe: Buffer): Promise<Buffer> {
    const id = TrousseauCles.identifiantDe(enveloppe);
    if (id === undefined) {
      if (!this.historique) throw new ErreurChiffrement('Clé maître inconnue.');
      return this.historique.desenvelopper(enveloppe);
    }
    const cle = this.parIdentifiant.get(id);
    if (!cle) throw new ErreurChiffrement('Clé maître inconnue.');
    return cle.desenvelopper(enveloppe.subarray(2 + id.length));
  }
}

/**
 * Chiffre un document. L'identifiant du document est lié au contenu (données authentifiées) : un
 * contenu ne peut pas être échangé avec celui d'un autre document sans être détecté.
 */
export async function chiffrer(
  contenu: Buffer,
  documentId: string,
  maitre: CleMaitre,
): Promise<{ donnees: Buffer; cleEnveloppee: Buffer }> {
  const cle = randomBytes(32);
  try {
    return {
      donnees: chiffrerGcm(cle, contenu, Buffer.from(documentId)),
      cleEnveloppee: await maitre.envelopper(cle),
    };
  } finally {
    cle.fill(0);
  }
}

export async function dechiffrer(
  donnees: Buffer,
  cleEnveloppee: Buffer,
  documentId: string,
  maitre: CleMaitre,
): Promise<Buffer> {
  const cle = await maitre.desenvelopper(cleEnveloppee);
  try {
    return dechiffrerGcm(cle, donnees, Buffer.from(documentId));
  } finally {
    cle.fill(0);
  }
}
