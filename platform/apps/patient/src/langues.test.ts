import { describe, expect, it } from 'vitest';
import {
  garderLangue,
  langueAEnvoyer,
  langueGardee,
  languesProposees,
  marquerEnvoyee,
} from './langues.js';
import { fictif } from './textes-fictif.js';
import { fr } from './textes-fr.js';

const CATALOGUES = ['fr', 'fr-x-fictif'];

function stockage(depart: Record<string, string> = {}): Storage {
  const valeurs = new Map(Object.entries(depart));
  return {
    getItem: (c: string) => valeurs.get(c) ?? null,
    setItem: (c: string, v: string) => void valeurs.set(c, v),
  } as Storage;
}

describe('langues proposées (VITE_LANGUES)', () => {
  it('garde l’ordre du pays et le nom écrit dans chaque langue', () => {
    expect(languesProposees('fr:Français,fr-x-fictif:[FICTIF] Démo', CATALOGUES)).toEqual([
      { code: 'fr', nom: 'Français' },
      { code: 'fr-x-fictif', nom: '[FICTIF] Démo' },
    ]);
  });

  it('ne propose jamais une langue sans catalogue, ni une entrée mal formée ou en double', () => {
    expect(
      languesProposees(
        'fan:Fang,fr:Français,:Vide,fr:Encore,FR-x:Majuscules,fr-x-fictif:',
        CATALOGUES,
      ),
    ).toEqual([{ code: 'fr', nom: 'Français' }]);
  });

  it('retombe sur le français quand rien n’est valable', () => {
    expect(languesProposees('', CATALOGUES)).toEqual([{ code: 'fr', nom: 'Français' }]);
    expect(languesProposees('fan:Fang', CATALOGUES)).toEqual([{ code: 'fr', nom: 'Français' }]);
  });
});

describe('langue gardée sur le téléphone', () => {
  const langues = languesProposees('fr:Français,fr-x-fictif:[FICTIF] Démo', CATALOGUES);

  it('reprend le choix gardé, ou la première langue du pays', () => {
    const s = stockage();
    expect(langueGardee(s, langues)).toBe('fr');
    garderLangue(s, 'fr-x-fictif');
    expect(langueGardee(s, langues)).toBe('fr-x-fictif');
  });

  it('ignore un choix qui n’est plus proposé (langue retirée au déploiement)', () => {
    expect(langueGardee(stockage({ 'mbolo.langue': 'fan' }), langues)).toBe('fr');
  });

  it('fonctionne sans stockage (navigation privée)', () => {
    const refuse = {
      getItem: () => {
        throw new Error('refusé');
      },
      setItem: () => {
        throw new Error('refusé');
      },
    } as unknown as Storage;
    expect(langueGardee(refuse, langues)).toBe('fr');
    expect(() => garderLangue(refuse, 'fr')).not.toThrow();
  });
});

describe('langue enregistrée dans le dossier (ADR-0025)', () => {
  const langues = languesProposees('fr:Français,fr-x-fictif:[FICTIF] Démo', CATALOGUES);

  it('envoie la langue choisie par le patient une seule fois par session', () => {
    const local = stockage({ 'mbolo.langue': 'fr-x-fictif' });
    const session = stockage();
    expect(langueAEnvoyer(local, session, langues)).toBe('fr-x-fictif');
    marquerEnvoyee(session, 'fr-x-fictif');
    expect(langueAEnvoyer(local, session, langues)).toBeUndefined();
    // Nouveau choix dans la même session : envoyé à nouveau.
    garderLangue(local, 'fr');
    expect(langueAEnvoyer(local, session, langues)).toBe('fr');
  });

  it('n’envoie rien sans choix du patient, pour une langue retirée, ou sans stockage', () => {
    expect(langueAEnvoyer(stockage(), stockage(), langues)).toBeUndefined();
    expect(langueAEnvoyer(stockage({ 'mbolo.langue': 'en' }), stockage(), langues)).toBeUndefined();
    expect(langueAEnvoyer(undefined, undefined, langues)).toBeUndefined();
    const refuse = {
      getItem: () => {
        throw new Error('stockage refusé');
      },
    } as unknown as Storage;
    expect(langueAEnvoyer(refuse, refuse, langues)).toBeUndefined();
  });
});

describe('catalogue de démonstration [FICTIF]', () => {
  it('ne contient que des clés du français, chaque texte marqué [FICTIF]', () => {
    for (const [cle, texte] of Object.entries(fictif)) {
      expect(Object.keys(fr)).toContain(cle);
      expect(texte).toMatch(/^\[FICTIF\] /);
    }
  });
});

describe('codes de langue', () => {
  it('refuse un code trop long ou mal formé, sans lenteur même sur une entrée piégée', () => {
    const piege = `fr${'-a'.repeat(5000)}!`;
    const debut = Date.now();
    expect(languesProposees(`${piege}:Piège`, [piege])).toEqual([{ code: 'fr', nom: 'Français' }]);
    expect(Date.now() - debut).toBeLessThan(100);
    expect(languesProposees('f:Court,fr--x:Vide', ['f', 'fr--x'])).toEqual([
      { code: 'fr', nom: 'Français' },
    ]);
  });
});
