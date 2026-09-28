// Trousseau de clés maîtres d'après l'environnement (ADR-0016), commun au service et à la commande
// de rotation. Valeurs depuis le coffre-fort, jamais le dépôt.
// - Actuelle : le KMS de l'hébergeur si `DOCUMENTS_KMS_URL` est défini, sinon la clé locale.
// - Anciennes : `DOCUMENTS_CLES_MAITRES_ANCIENNES` (« id:base64,id:base64 ») et la clé locale quand
//   le KMS est l'actuelle, pour relire les clés pas encore ré-enveloppées.
// - Historique : la clé locale relit les enveloppes écrites avant le trousseau (sans identifiant).
import { lirePem } from '@mbolo/identite';
import {
  CleMaitreLocale,
  ErreurChiffrement,
  TrousseauCles,
  type CleMaitreNommee,
} from './chiffrement.js';
import { CleMaitreKms, transportHttps } from './kms.js';

export function trousseauDepuis(env: Record<string, string | undefined>): TrousseauCles {
  const locale = env['DOCUMENTS_CLE_MAITRE']
    ? new CleMaitreLocale(env['DOCUMENTS_CLE_MAITRE'], env['DOCUMENTS_CLE_MAITRE_ID'] ?? 'locale')
    : undefined;
  const anciennes: CleMaitreNommee[] = (env['DOCUMENTS_CLES_MAITRES_ANCIENNES'] ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const i = x.indexOf(':');
      if (i < 1) throw new ErreurChiffrement('Ancienne clé maître mal formée (id:base64).');
      return new CleMaitreLocale(x.slice(i + 1), x.slice(0, i));
    });

  let actuelle: CleMaitreNommee | undefined = locale;
  const kmsUrl = env['DOCUMENTS_KMS_URL'];
  if (kmsUrl) {
    const reference = env['STORAGE_KMS_KEY_REFERENCE'];
    const certificat = env['DOCUMENTS_KMS_CERTIFICAT'];
    const clePrivee = env['DOCUMENTS_KMS_CLE_PRIVEE'];
    if (!reference || !certificat || !clePrivee) {
      throw new ErreurChiffrement(
        'KMS : STORAGE_KMS_KEY_REFERENCE, DOCUMENTS_KMS_CERTIFICAT et DOCUMENTS_KMS_CLE_PRIVEE sont obligatoires.',
      );
    }
    actuelle = new CleMaitreKms(
      reference,
      transportHttps({
        base: kmsUrl,
        cle: reference,
        certificat: lirePem(certificat),
        clePrivee: lirePem(clePrivee),
        ...(env['DOCUMENTS_KMS_AUTORITE']
          ? { autorite: lirePem(env['DOCUMENTS_KMS_AUTORITE']) }
          : {}),
      }),
    );
    if (locale) anciennes.push(locale);
  }
  if (!actuelle) {
    throw new ErreurChiffrement('Aucune clé maître : DOCUMENTS_KMS_URL ou DOCUMENTS_CLE_MAITRE.');
  }
  return new TrousseauCles(actuelle, anciennes, locale);
}
