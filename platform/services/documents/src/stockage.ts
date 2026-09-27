// Stockage des contenus chiffrés : mémoire (tests) ou objet compatible S3 (ADR-0015 : OVHcloud en
// production, SeaweedFS en local et en CI). Le nom d'un objet est l'identifiant du document :
// ni nom de patient, ni type de document.
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export interface Stockage {
  ecrire(nom: string, octets: Buffer): Promise<void>;
  lire(nom: string): Promise<Buffer | undefined>;
  supprimer(nom: string): Promise<void>;
}

export class StockageMemoire implements Stockage {
  readonly objets = new Map<string, Buffer>();

  async ecrire(nom: string, octets: Buffer): Promise<void> {
    this.objets.set(nom, Buffer.from(octets));
  }

  async lire(nom: string): Promise<Buffer | undefined> {
    const o = this.objets.get(nom);
    return o ? Buffer.from(o) : undefined;
  }

  async supprimer(nom: string): Promise<void> {
    this.objets.delete(nom);
  }
}

export interface OptionsS3 {
  /** Adresse du service S3, ex. https://s3.gra.io.cloud.ovh.net ou http://127.0.0.1:8333 */
  url: string;
  region: string;
  compartiment: string;
  cleAcces: string;
  secret: string;
}

export class StockageS3 implements Stockage {
  private readonly client: S3Client;

  constructor(private readonly o: OptionsS3) {
    this.client = new S3Client({
      endpoint: o.url,
      region: o.region,
      forcePathStyle: true,
      credentials: { accessKeyId: o.cleAcces, secretAccessKey: o.secret },
    });
  }

  async ecrire(nom: string, octets: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.o.compartiment,
        Key: nom,
        Body: octets,
        ContentType: 'application/octet-stream',
      }),
    );
  }

  async lire(nom: string): Promise<Buffer | undefined> {
    try {
      const r = await this.client.send(
        new GetObjectCommand({ Bucket: this.o.compartiment, Key: nom }),
      );
      return r.Body ? Buffer.from(await r.Body.transformToByteArray()) : undefined;
    } catch (e) {
      if (e instanceof NoSuchKey) return undefined;
      throw e;
    }
  }

  async supprimer(nom: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.o.compartiment, Key: nom }));
  }
}
