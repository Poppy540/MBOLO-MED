import { describe, expect, it } from 'vitest';
import { ALPHABET, creerEmpreinte, genererCode, normaliser, presenter } from './codes.js';
import { DepotMemoire } from './depot.js';
import { Limiteur } from './limiteur.js';
import { ErreurInvitation, ServiceInvitations } from './service.js';

// Clé de test construite à l'exécution (aucune clé dans le dépôt).
const CLE = 'essai-'.repeat(8);
const empreinte = creerEmpreinte(CLE);
const PARAMETRES = { cohortes: ['ville-fictive'], quotaParCohorte: 3, validiteJours: 14 };

function service(horloge = () => new Date('2026-10-01T08:00:00Z')) {
  const depot = new DepotMemoire();
  return { depot, service: new ServiceInvitations(depot, empreinte, PARAMETRES, horloge) };
}

describe('codes', () => {
  it('tire 8 caractères sans caractères ambigus', () => {
    for (const c of ['0', 'O', '1', 'I', 'L']) expect(ALPHABET).not.toContain(c);
    for (let i = 0; i < 200; i++) {
      const code = genererCode();
      expect(code).toMatch(new RegExp(`^[${ALPHABET}]{8}$`));
    }
  });

  it('présente et relit un code saisi avec espaces, tirets ou minuscules', () => {
    expect(presenter('ABCD2345')).toBe('ABCD-2345');
    expect(normaliser(' abcd-2345 ')).toBe('ABCD2345');
    expect(normaliser('ab cd 23 45')).toBe('ABCD2345');
    expect(normaliser('ABCD234')).toBeUndefined();
    expect(normaliser('ABCD-0345')).toBeUndefined();
  });

  it("n'accepte pas une clé d'empreinte trop courte, et l'empreinte dépend de la clé", () => {
    expect(() => creerEmpreinte('courte')).toThrow();
    expect(empreinte('ABCD2345').equals(empreinte('ABCD2345'))).toBe(true);
    expect(creerEmpreinte('autre-'.repeat(8))('ABCD2345').equals(empreinte('ABCD2345'))).toBe(
      false,
    );
  });
});

describe('service des invitations', () => {
  it('crée un code valable 14 jours sans jamais le conserver en clair', async () => {
    const { depot, service: s } = service();
    const i = await s.creer({ cohorte: 'ville-fictive', par: 'sujet-gestionnaire-fictif' });
    expect(i.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(i.expireLe).toBe('2026-10-15T08:00:00.000Z');
    const stocke = JSON.stringify(depot.invitations);
    expect(stocke).not.toContain(i.code.replace('-', ''));
    expect(stocke).not.toContain(i.code);
    expect(await s.verifier(i.code)).toBe(true);
  });

  it('refuse une cohorte non ouverte dans le déploiement', async () => {
    const { service: s } = service();
    await expect(s.creer({ cohorte: 'autre-ville', par: 'x' })).rejects.toMatchObject({
      motif: 'cohorte-inconnue',
    });
  });

  it('respecte le quota de la cohorte, révocations comprises', async () => {
    const { service: s } = service();
    const premiers = [];
    for (let n = 0; n < 3; n++)
      premiers.push(await s.creer({ cohorte: 'ville-fictive', par: 'x' }));
    await s.revoquer(premiers[0]?.id ?? '');
    await expect(s.creer({ cohorte: 'ville-fictive', par: 'x' })).rejects.toBeInstanceOf(
      ErreurInvitation,
    );
  });

  it('un code ne sert qu’une fois', async () => {
    const { service: s } = service();
    const { code } = await s.creer({ cohorte: 'ville-fictive', par: 'x' });
    expect(await s.utiliser(code, 'sujet-patient-fictif-1')).toBe('ville-fictive');
    expect(await s.utiliser(code, 'sujet-patient-fictif-2')).toBeUndefined();
    expect(await s.verifier(code)).toBe(false);
  });

  it('refuse un code expiré, révoqué ou inconnu, sans dire pourquoi', async () => {
    let maintenant = new Date('2026-10-01T08:00:00Z');
    const { service: s } = service(() => maintenant);
    const expire = await s.creer({ cohorte: 'ville-fictive', par: 'x' });
    const revoque = await s.creer({ cohorte: 'ville-fictive', par: 'x' });
    await s.revoquer(revoque.id);
    expect(await s.verifier(revoque.code)).toBe(false);
    expect(await s.verifier('ZZZZ-ZZZZ')).toBe(false);
    maintenant = new Date('2026-10-15T08:00:00Z');
    expect(await s.verifier(expire.code)).toBe(false);
    expect(await s.utiliser(expire.code, 'sujet-patient-fictif')).toBeUndefined();
  });

  it('ne révoque pas un code déjà utilisé', async () => {
    const { service: s } = service();
    const i = await s.creer({ cohorte: 'ville-fictive', par: 'x' });
    await s.utiliser(i.code, 'sujet-patient-fictif');
    await expect(s.revoquer(i.id)).rejects.toMatchObject({ motif: 'introuvable' });
  });

  it('liste les invitations sans code ni empreinte', async () => {
    const { service: s } = service();
    const i = await s.creer({ cohorte: 'ville-fictive', par: 'x' });
    const liste = await s.lister('ville-fictive');
    expect(liste).toEqual([
      {
        id: i.id,
        cohorte: 'ville-fictive',
        creeLe: expect.any(String),
        expireLe: i.expireLe,
        statut: 'valide',
      },
    ]);
  });

  it('refuse des paramètres de déploiement invalides', () => {
    const d = new DepotMemoire();
    expect(() => new ServiceInvitations(d, empreinte, { ...PARAMETRES, cohortes: [] })).toThrow();
    expect(
      () => new ServiceInvitations(d, empreinte, { ...PARAMETRES, cohortes: ['Ville Fictive'] }),
    ).toThrow();
    expect(
      () => new ServiceInvitations(d, empreinte, { ...PARAMETRES, quotaParCohorte: 0 }),
    ).toThrow();
    expect(
      () => new ServiceInvitations(d, empreinte, { ...PARAMETRES, validiteJours: 365 }),
    ).toThrow();
  });
});

describe('limiteur', () => {
  it('bloque au-delà du maximum puis rouvre après la fenêtre', () => {
    const l = new Limiteur(2, 1_000);
    expect(l.essayer('ip', 0)).toBe(true);
    expect(l.essayer('ip', 10)).toBe(true);
    expect(l.essayer('ip', 20)).toBe(false);
    expect(l.essayer('autre-ip', 20)).toBe(true);
    expect(l.essayer('ip', 1_000)).toBe(true);
  });
});
