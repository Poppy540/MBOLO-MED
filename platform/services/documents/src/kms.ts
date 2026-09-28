// Clé maître dans le KMS de l'hébergeur (ADR-0016, décision A) : la clé maître ne quitte jamais le
// module matériel ; le service lui demande d'envelopper ou de désenvelopper la clé de chaque
// document, par une API REST authentifiée par certificat client (TLS mutuel).
//
// Format retenu pour OVHcloud KMS (« service key », opérations encrypt / decrypt) :
//   POST <base>/v1/servicekey/<cle>/encrypt   { plaintext: base64, context }  → { ciphertext }
//   POST <base>/v1/servicekey/<cle>/decrypt   { ciphertext, context }         → { plaintext: base64 }
// À confronter à la documentation officielle au moment du contrat : seul `TransportKms` et ces deux
// chemins changeraient. Aucune bibliothèque ajoutée : `node:https`.
import { request } from 'node:https';
import { ErreurChiffrement, type CleMaitreNommee } from './chiffrement.js';

/** Contexte lié à chaque opération : une enveloppe ne sert qu'aux clés de documents Mbolo. */
const CONTEXTE = 'mbolo-cle-document';

export class ErreurKmsIndisponible extends ErreurChiffrement {
  constructor() {
    super('Service de clés indisponible.');
  }
}

/** Envoie une requête JSON au KMS et renvoie sa réponse JSON ; lève en cas d'échec. */
export type TransportKms = (chemin: string, corps: Record<string, string>) => Promise<unknown>;

export interface OptionsKms {
  /** Adresse de l'API du KMS, ex. https://eu-west-rbx.okms.ovh.net/api/<identifiant du KMS> */
  base: string;
  /** Référence de la clé de service (STORAGE_KMS_KEY_REFERENCE), jamais la clé elle-même. */
  cle: string;
  /** Certificat et clé privée du client (PEM), depuis le coffre-fort. */
  certificat: string;
  clePrivee: string;
  /** Autorité de confiance du KMS (PEM), si elle n'est pas publique. */
  autorite?: string;
  delaiMs?: number;
}

/** Transport HTTPS avec certificat client ; refuse toute adresse qui n'est pas en https. */
export function transportHttps(o: OptionsKms): TransportKms {
  const base = new URL(o.base);
  if (base.protocol !== 'https:') throw new ErreurChiffrement('Le KMS doit être joint en https.');
  return (chemin, corps) =>
    new Promise((resoudre, rejeter) => {
      const donnees = JSON.stringify(corps);
      const req = request(
        new URL(`${base.pathname.replace(/\/$/, '')}${chemin}`, base),
        {
          method: 'POST',
          cert: o.certificat,
          key: o.clePrivee,
          ...(o.autorite ? { ca: o.autorite } : {}),
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(donnees),
          },
          timeout: o.delaiMs ?? 5_000,
        },
        (res) => {
          const morceaux: Buffer[] = [];
          res.on('data', (m: Buffer) => morceaux.push(m));
          res.on('end', () => {
            if ((res.statusCode ?? 500) >= 300) return rejeter(new Error(`KMS ${res.statusCode}`));
            try {
              resoudre(JSON.parse(Buffer.concat(morceaux).toString('utf8')));
            } catch (e) {
              rejeter(e as Error);
            }
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('KMS : délai dépassé')));
      req.on('error', rejeter);
      req.end(donnees);
    });
}

export class CleMaitreKms implements CleMaitreNommee {
  readonly identifiant: string;

  constructor(
    private readonly cle: string,
    private readonly transport: TransportKms,
  ) {
    if (!/^[A-Za-z0-9._:-]{1,120}$/.test(cle)) {
      throw new ErreurChiffrement('Référence de clé KMS invalide.');
    }
    this.identifiant = `kms:${cle}`;
  }

  private async appeler(operation: 'encrypt' | 'decrypt', corps: Record<string, string>) {
    try {
      return (await this.transport(`/v1/servicekey/${encodeURIComponent(this.cle)}/${operation}`, {
        ...corps,
        context: CONTEXTE,
      })) as Record<string, unknown>;
    } catch {
      // Jamais le détail de l'erreur (elle pourrait citer des données de la requête).
      throw new ErreurKmsIndisponible();
    }
  }

  async envelopper(cle: Buffer): Promise<Buffer> {
    const r = await this.appeler('encrypt', { plaintext: cle.toString('base64') });
    if (typeof r['ciphertext'] !== 'string') throw new ErreurKmsIndisponible();
    return Buffer.from(r['ciphertext'], 'utf8');
  }

  async desenvelopper(enveloppe: Buffer): Promise<Buffer> {
    const r = await this.appeler('decrypt', { ciphertext: enveloppe.toString('utf8') });
    if (typeof r['plaintext'] !== 'string') throw new ErreurKmsIndisponible();
    return Buffer.from(r['plaintext'], 'base64');
  }
}
