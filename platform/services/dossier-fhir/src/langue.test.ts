import { describe, expect, it } from 'vitest';
import { codeLangueValide, communicationPreferee, languePreferee } from './langue.js';

describe('langue préférée du patient (ADR-0025)', () => {
  it('accepte des codes BCP 47 simples, refuse le reste', () => {
    for (const c of ['fr', 'fr-GA', 'fr-x-fictif', 'fan']) expect(codeLangueValide(c)).toBe(true);
    for (const c of [
      '',
      'FR',
      'f',
      'fr_GA',
      'fr-',
      'fr-toolongtag',
      'fr-a-b-c-d-e',
      'x'.repeat(40),
    ]) {
      expect(codeLangueValide(c)).toBe(false);
    }
  });

  it('reste rapide sur une entrée piégée', () => {
    const debut = performance.now();
    codeLangueValide(`fr${'-a'.repeat(5000)}!`);
    expect(performance.now() - debut).toBeLessThan(100);
  });

  it('écrit une seule langue, préférée, et la relit', () => {
    const communication = communicationPreferee('fr-x-fictif');
    expect(communication).toEqual([
      {
        language: { coding: [{ system: 'urn:ietf:bcp:47', code: 'fr-x-fictif' }] },
        preferred: true,
      },
    ]);
    expect(languePreferee({ communication })).toBe('fr-x-fictif');
    expect(() => communicationPreferee('fr_GA')).toThrow();
  });

  it('préfère la langue marquée, sinon la première ; ignore un code invalide', () => {
    const langue = (code: string, preferred?: boolean) => ({
      language: { coding: [{ system: 'urn:ietf:bcp:47', code }] },
      ...(preferred === undefined ? {} : { preferred }),
    });
    expect(languePreferee({ communication: [langue('fr'), langue('en', true)] })).toBe('en');
    expect(languePreferee({ communication: [langue('fr'), langue('en')] })).toBe('fr');
    expect(languePreferee({ communication: [langue('pas valable', true)] })).toBeUndefined();
    expect(languePreferee({})).toBeUndefined();
  });
});
