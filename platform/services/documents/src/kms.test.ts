import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CleMaitreLocale, ErreurChiffrement, TrousseauCles } from './chiffrement.js';
import { trousseauDepuis } from './cles.js';
import { DepotMemoire } from './depot.js';
import { CleMaitreKms, ErreurKmsIndisponible, type TransportKms } from './kms.js';
import { reenvelopper } from './rotation.js';
import { ServiceDocuments } from './service.js';
import { StockageMemoire } from './stockage.js';

// Faux KMS [FICTIF] : garde sa clé pour lui, vérifie le contexte, et note les appels.
function fauxKms(enPanne = () => false) {
  const interne = new CleMaitreLocale(randomBytes(32).toString('base64'), 'hsm');
  const appels: { chemin: string; corps: Record<string, string> }[] = [];
  const transport: TransportKms = async (chemin, corps) => {
    appels.push({ chemin, corps });
    if (enPanne()) throw new Error('connexion refusée (détail interne du KMS)');
    if (corps['context'] !== 'mbolo-cle-document') throw new Error('contexte');
    if (chemin.endsWith('/encrypt')) {
      const e = await interne.envelopper(Buffer.from(corps['plaintext'] ?? '', 'base64'));
      return { ciphertext: e.toString('base64') };
    }
    const c = await interne.desenvelopper(Buffer.from(corps['ciphertext'] ?? '', 'base64'));
    return { plaintext: c.toString('base64') };
  };
  return { transport, appels };
}

const locale = (id = 'locale') => new CleMaitreLocale(randomBytes(32).toString('base64'), id);
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(300)]);

describe('clé maître dans le KMS (ADR-0016)', () => {
  it('enveloppe et désenveloppe par le KMS, avec la référence de clé et le contexte', async () => {
    const { transport, appels } = fauxKms();
    const kms = new CleMaitreKms('cle-fictive-01', transport);
    const cle = randomBytes(32);
    expect(await kms.desenvelopper(await kms.envelopper(cle))).toEqual(cle);
    expect(appels.map((a) => a.chemin)).toEqual([
      '/v1/servicekey/cle-fictive-01/encrypt',
      '/v1/servicekey/cle-fictive-01/decrypt',
    ]);
    expect(kms.identifiant).toBe('kms:cle-fictive-01');
  });

  it('KMS indisponible : erreur générique, sans le détail interne', async () => {
    const kms = new CleMaitreKms('cle-fictive-01', fauxKms(() => true).transport);
    const e = await kms.envelopper(randomBytes(32)).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurKmsIndisponible);
    expect((e as Error).message).not.toContain('détail interne');
  });

  it('le trousseau écrit l’identifiant de la clé et relit anciennes et historiques', async () => {
    const ancienne = locale('locale');
    const avant = await ancienne.envelopper(randomBytes(32)); // enveloppe écrite avant le trousseau
    const kms = new CleMaitreKms('cle-fictive-01', fauxKms().transport);
    const t = new TrousseauCles(kms, [ancienne], ancienne);
    const cle = randomBytes(32);
    const env = await t.envelopper(cle);
    expect(TrousseauCles.identifiantDe(env)).toBe('kms:cle-fictive-01');
    expect(await t.desenvelopper(env)).toEqual(cle);
    expect((await t.desenvelopper(avant)).length).toBe(32);
    // Une enveloppe d'une clé inconnue est refusée.
    const autre = await new TrousseauCles(locale('inconnue')).envelopper(cle);
    await expect(t.desenvelopper(autre)).rejects.toBeInstanceOf(ErreurChiffrement);
  });

  it('rotation : ré-enveloppe sans déchiffrer les documents, reprise possible', async () => {
    const depot = new DepotMemoire();
    const stockage = new StockageMemoire();
    const ancienne = locale('locale');
    const avant = new ServiceDocuments(depot, stockage, new TrousseauCles(ancienne), {
      conservationJours: 90,
      maxParType: 2,
    });
    const photos = [jpeg(), jpeg(), jpeg()];
    const ids = [];
    for (const [i, octets] of photos.entries()) {
      const d = await avant.deposer({
        patientId: `pat-fictif-00${i}`,
        type: 'visage',
        octets,
        versionCharte: '0.1',
      });
      ids.push(d.id);
    }
    const contenus = [...stockage.objets.values()].map((b) => Buffer.from(b));
    const kms = new CleMaitreKms('cle-fictive-02', fauxKms().transport);

    const bilan = await reenvelopper(depot, new TrousseauCles(kms, [ancienne], ancienne), 2);
    expect(bilan).toEqual({ examinees: 3, reenveloppees: 3, dejaAJour: 0, ignorees: 0 });
    // Les documents chiffrés eux-mêmes n'ont pas changé.
    expect([...stockage.objets.values()]).toEqual(contenus);
    // Sans l'ancienne clé, tout reste lisible par le KMS seul.
    const apres = new ServiceDocuments(depot, stockage, new TrousseauCles(kms), {
      conservationJours: 90,
      maxParType: 2,
    });
    for (const [i, id] of ids.entries()) expect((await apres.lire(id)).octets).toEqual(photos[i]);
    expect(await reenvelopper(depot, new TrousseauCles(kms))).toMatchObject({
      reenveloppees: 0,
      dejaAJour: 3,
    });
  });

  it('configuration : clé locale par défaut, KMS complet ou refus clair', () => {
    const cle = randomBytes(32).toString('base64');
    expect(trousseauDepuis({ DOCUMENTS_CLE_MAITRE: cle }).actuelle.identifiant).toBe('locale');
    expect(() => trousseauDepuis({})).toThrow(/Aucune clé maître/);
    expect(() =>
      trousseauDepuis({
        DOCUMENTS_CLE_MAITRE: cle,
        DOCUMENTS_KMS_URL: 'https://kms.exemple.invalid/api/x',
      }),
    ).toThrow(/obligatoires/);
    expect(() =>
      trousseauDepuis({
        DOCUMENTS_KMS_URL: 'http://kms.exemple.invalid/api/x',
        STORAGE_KMS_KEY_REFERENCE: 'cle-fictive',
        DOCUMENTS_KMS_CERTIFICAT: 'certificat-fictif',
        DOCUMENTS_KMS_CLE_PRIVEE: 'cle-fictive',
      }),
    ).toThrow(/https/);
    expect(() =>
      trousseauDepuis({
        DOCUMENTS_CLE_MAITRE: cle,
        DOCUMENTS_CLES_MAITRES_ANCIENNES: 'sans-separateur',
      }),
    ).toThrow(/id:base64/);
  });
});
