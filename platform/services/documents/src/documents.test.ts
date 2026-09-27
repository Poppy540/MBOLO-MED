import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CleMaitreLocale, ErreurChiffrement, chiffrer, dechiffrer } from './chiffrement.js';
import { DepotMemoire } from './depot.js';
import { reconnaitre } from './format.js';
import { ErreurDocument, ServiceDocuments } from './service.js';
import { StockageMemoire } from './stockage.js';

// Clés et « photos » de test construites à l'exécution : aucune clé, aucune image réelle.
const maitre = () => new CleMaitreLocale(randomBytes(32).toString('base64'));
const jpeg = (taille = 2_000) =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(taille, 'FICTIF-')]);
const png = () =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(500, 1),
  ]);

describe('chiffrement par enveloppe', () => {
  it('déchiffre avec la bonne clé et le bon document seulement', async () => {
    const m = maitre();
    const clair = jpeg();
    const { donnees, cleEnveloppee } = await chiffrer(clair, 'doc-1', m);
    expect(donnees.includes(Buffer.from('FICTIF-FICTIF-'))).toBe(false);
    expect(await dechiffrer(donnees, cleEnveloppee, 'doc-1', m)).toEqual(clair);
    // Contenu présenté comme celui d'un autre document, autre clé maître, contenu altéré : refus.
    await expect(dechiffrer(donnees, cleEnveloppee, 'doc-2', m)).rejects.toBeInstanceOf(
      ErreurChiffrement,
    );
    await expect(dechiffrer(donnees, cleEnveloppee, 'doc-1', maitre())).rejects.toBeInstanceOf(
      ErreurChiffrement,
    );
    const altere = Buffer.from(donnees);
    altere[altere.length - 1] = (altere[altere.length - 1] ?? 0) ^ 1;
    await expect(dechiffrer(altere, cleEnveloppee, 'doc-1', m)).rejects.toBeInstanceOf(
      ErreurChiffrement,
    );
  });

  it('refuse une clé maître qui ne fait pas 32 octets', () => {
    expect(() => new CleMaitreLocale(randomBytes(16).toString('base64'))).toThrow(
      ErreurChiffrement,
    );
  });

  it('tire une clé différente pour chaque document', async () => {
    const m = maitre();
    const a = await chiffrer(jpeg(), 'doc-1', m);
    const b = await chiffrer(jpeg(), 'doc-1', m);
    expect(a.cleEnveloppee.equals(b.cleEnveloppee)).toBe(false);
    expect(a.donnees.equals(b.donnees)).toBe(false);
  });
});

describe('formats', () => {
  it('reconnaît JPEG et PNG à leur contenu, rien d’autre', () => {
    expect(reconnaitre(jpeg())).toBe('image/jpeg');
    expect(reconnaitre(png())).toBe('image/png');
    expect(reconnaitre(Buffer.from('%PDF-1.7 [FICTIF]'))).toBeUndefined();
    expect(reconnaitre(Buffer.from('<svg onload="alert(1)">'))).toBeUndefined();
  });
});

function monter(debut = new Date('2026-10-01T08:00:00Z')) {
  const horloge = { maintenant: debut };
  const depot = new DepotMemoire();
  const stockage = new StockageMemoire();
  const service = new ServiceDocuments(
    depot,
    stockage,
    maitre(),
    { conservationJours: 30, maxParType: 2 },
    () => horloge.maintenant,
  );
  return { service, depot, stockage, horloge };
}

const depot = (type = 'piece-identite', octets = jpeg()) => ({
  patientId: 'pat-fictif-001',
  type,
  octets,
  versionCharte: '0.1',
});

describe('service des documents', () => {
  it('range un document chiffré, sans nom, et le relit en clair', async () => {
    const { service, stockage, depot: d } = monter();
    const photo = jpeg();
    const r = await service.deposer(depot('visage', photo));
    expect(r).toMatchObject({ type: 'visage', format: 'image/jpeg' });
    expect(r.supprimerLe).toBe('2026-10-31T08:00:00.000Z');
    // Nom de l'objet : l'identifiant seul ; contenu : illisible.
    expect([...stockage.objets.keys()]).toEqual([r.id]);
    expect(stockage.objets.get(r.id)?.includes(Buffer.from('FICTIF-FICTIF-'))).toBe(false);
    expect(JSON.stringify(d.lignes)).not.toContain('FICTIF-FICTIF-');
    expect((await service.lire(r.id)).octets).toEqual(photo);
    // La liste ne donne jamais la clé.
    expect(JSON.stringify(await service.duPatient('pat-fictif-001'))).not.toContain(
      'cleEnveloppee',
    );
  });

  it.each([
    ['un autre format', depot('visage', Buffer.from('%PDF-1.7 [FICTIF]')), 'format'],
    ['une photo trop lourde', depot('visage', jpeg(3 * 1024 * 1024)), 'taille'],
    ['un type inconnu', depot('selfie-avec-carte'), 'type'],
  ])('refuse %s', async (_cas, demande, motif) => {
    const { service, stockage } = monter();
    await expect(service.deposer(demande)).rejects.toMatchObject({ motif });
    expect(stockage.objets.size).toBe(0);
  });

  it('limite le nombre de photos par type', async () => {
    const { service } = monter();
    await service.deposer(depot());
    await service.deposer(depot());
    await expect(service.deposer(depot())).rejects.toBeInstanceOf(ErreurDocument);
    await expect(service.deposer(depot('visage'))).resolves.toBeDefined();
  });

  it('à échéance, détruit la clé puis l’objet : le document devient illisible', async () => {
    const { service, stockage, depot: d, horloge } = monter();
    const r = await service.deposer(depot('visage'));
    expect(await service.supprimerEchus()).toBe(0);
    horloge.maintenant = new Date('2026-10-31T08:00:00Z');
    expect(await service.supprimerEchus()).toBe(1);
    expect(stockage.objets.size).toBe(0);
    const trace = d.lignes[0];
    expect(trace?.cleEnveloppee).toBeUndefined();
    expect(trace?.supprimeLe).toBeDefined();
    await expect(service.lire(r.id)).rejects.toMatchObject({ motif: 'introuvable' });
    expect(await service.duPatient('pat-fictif-001')).toEqual([]);
    expect(await service.supprimerEchus()).toBe(0);
  });

  it('retire le contenu si les métadonnées ne peuvent pas être enregistrées', async () => {
    const { service, stockage, depot: d } = monter();
    d.insererSiPlace = async () => {
      throw new Error('base indisponible');
    };
    await expect(service.deposer(depot())).rejects.toThrow('base indisponible');
    expect(stockage.objets.size).toBe(0);
  });

  it('limite atteinte entre le contrôle et l’insertion : le contenu est retiré', async () => {
    const { service, stockage, depot: d } = monter();
    d.insererSiPlace = async () => false;
    await expect(service.deposer(depot())).rejects.toMatchObject({ motif: 'trop-de-documents' });
    expect(stockage.objets.size).toBe(0);
  });

  it('refuse des paramètres invalides', () => {
    const args = [new DepotMemoire(), new StockageMemoire(), maitre()] as const;
    expect(() => new ServiceDocuments(...args, { conservationJours: 0, maxParType: 2 })).toThrow();
    expect(() => new ServiceDocuments(...args, { conservationJours: 30, maxParType: 0 })).toThrow();
  });
});
