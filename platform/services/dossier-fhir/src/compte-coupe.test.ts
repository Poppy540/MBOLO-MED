import { describe, expect, it } from 'vitest';
import { estCompteCoupe, leverCompteCoupe, marqueCompteCoupe } from './compte-coupe.js';
import { valider } from './regles.js';

// Données FICTIVES.
const marque = () =>
  marqueCompteCoupe({
    practitionerId: 'prac-fictif-002',
    date: '2026-11-17T03:15:00Z',
    env: 'dev',
  });

describe('marque « compte coupé » (plan d’incident, E5)', () => {
  it('marque active sur la fiche du professionnel, datée, valide et sans texte libre', () => {
    const f = marque();
    expect(f).toMatchObject({
      resourceType: 'Flag',
      status: 'active',
      subject: { reference: 'Practitioner/prac-fictif-002' },
      period: { start: '2026-11-17T03:15:00Z' },
    });
    expect(estCompteCoupe(f)).toBe(true);
    expect(valider(f, 'dev')).toEqual([]);
  });

  it('levée : marque inactive et datée, jamais supprimée', () => {
    const levee = leverCompteCoupe(marque(), '2026-11-17T10:00:00Z');
    expect(levee).toMatchObject({
      status: 'inactive',
      period: { start: '2026-11-17T03:15:00Z', end: '2026-11-17T10:00:00Z' },
    });
    expect(estCompteCoupe(levee)).toBe(false);
    expect(valider(levee, 'dev')).toEqual([]);
  });

  it('mbolo-flag-1 : refus d’une marque sur un patient, d’un autre code ou d’un texte libre', () => {
    const f = marque();
    for (const fautive of [
      { ...f, subject: { reference: 'Patient/pat-fictif-001' } },
      { ...f, code: { coding: [{ system: 'urn:autre', code: 'compte-coupe' }] } },
      { ...f, code: { ...f.code, text: 'Le docteur a perdu son téléphone [FICTIF]' } },
      { ...f, period: {} },
    ]) {
      expect(valider(fautive, 'dev').map((v) => v.regle)).toContain('mbolo-flag-1');
    }
  });
});
