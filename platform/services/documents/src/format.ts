// Formats admis pour les photos (ADR-0015) : JPEG et PNG, reconnus à leur contenu, jamais à leur nom.
export type Format = 'image/jpeg' | 'image/png';

/** Photos compressées sur le téléphone : quelques centaines de Ko ; au-delà, refus. */
export const TAILLE_MAX = 2 * 1024 * 1024;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function reconnaitre(octets: Buffer): Format | undefined {
  if (octets.length >= 3 && octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff) {
    return 'image/jpeg';
  }
  if (octets.length >= PNG.length && octets.subarray(0, PNG.length).equals(PNG)) {
    return 'image/png';
  }
  return undefined;
}
