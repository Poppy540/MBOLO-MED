// Codes d'invitation (ADR-0013) : 8 caractères faciles à dicter ou à envoyer par SMS, sans
// caractères ambigus (ni 0/O, ni 1/I/L). Seule une empreinte HMAC est conservée, jamais le code.
import { createHmac, randomInt } from 'node:crypto';

/** 31 caractères : 8 tirages donnent environ 8,5 × 10¹¹ codes possibles. */
export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LONGUEUR_CODE = 8;

/** Tirage cryptographique ; le code n'est montré qu'une fois, à sa création. */
export function genererCode(): string {
  let code = '';
  for (let i = 0; i < LONGUEUR_CODE; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Présentation lisible : ABCD-EFGH. */
export const presenter = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

/**
 * Saisie d'un patient → code canonique, ou `undefined` si la saisie ne peut pas être un code.
 * Tolère minuscules, espaces et tirets ; les confusions courantes (O→0, I/L→1) ne sont pas corrigées :
 * ces caractères n'existent pas dans l'alphabet, la saisie est simplement refusée.
 */
export function normaliser(saisie: string): string | undefined {
  const code = saisie.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== LONGUEUR_CODE) return undefined;
  for (const c of code) if (!ALPHABET.includes(c)) return undefined;
  return code;
}

export type Empreinte = (code: string) => Buffer;

/**
 * Empreinte HMAC-SHA-256 avec une clé du coffre-fort : une fuite de la base ne permet pas de retrouver
 * les codes (8,5 × 10¹¹ possibilités se testeraient vite sans la clé).
 */
export function creerEmpreinte(cle: string): Empreinte {
  if (Buffer.byteLength(cle, 'utf8') < 32) {
    throw new Error("La clé d'empreinte des invitations doit faire au moins 32 octets.");
  }
  return (code) => createHmac('sha256', cle).update(code, 'utf8').digest();
}
