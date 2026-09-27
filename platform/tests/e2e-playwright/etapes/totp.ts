// Générateur de codes à usage unique (TOTP, RFC 6238, HMAC-SHA1, 6 chiffres, 30 s) pour les comptes
// FICTIFS soumis à la double authentification. Les secrets ne vivent qu'en mémoire, le temps des tests.
import { createHmac } from 'node:crypto';

const PERIODE_S = 30;
const secrets = new Map<string, Buffer>();
const dernierPas = new Map<string, number>();

export function retenirSecret(identifiant: string, secret: string): void {
  // Keycloak calcule le code sur les octets bruts du secret (champ caché « totpSecret »).
  secrets.set(identifiant, Buffer.from(secret, 'utf8'));
}

export function aUnSecret(identifiant: string): boolean {
  return secrets.has(identifiant);
}

function code(secret: Buffer, pas: number): string {
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(pas));
  const h = createHmac('sha1', secret).update(compteur).digest();
  const decalage = (h[h.length - 1] ?? 0) & 0x0f;
  const binaire = h.readUInt32BE(decalage) & 0x7fffffff;
  return String(binaire % 1_000_000).padStart(6, '0');
}

/**
 * Code valide pour le compte. Keycloak refuse de réutiliser un code : si le code de la période
 * courante a déjà servi, on attend la période suivante.
 */
export async function codeUnique(identifiant: string): Promise<string> {
  const secret = secrets.get(identifiant);
  if (!secret) throw new Error(`Aucun secret OTP pour ${identifiant}`);
  let pas = Math.floor(Date.now() / 1000 / PERIODE_S);
  const precedent = dernierPas.get(identifiant);
  if (precedent !== undefined && pas <= precedent) {
    const attente = (precedent + 1) * PERIODE_S * 1000 - Date.now() + 200;
    await new Promise((r) => setTimeout(r, attente));
    pas = precedent + 1;
  }
  dernierPas.set(identifiant, pas);
  return code(secret, pas);
}
