import { describe, expect, it } from 'vitest';
import { filtrer, specialites } from './annuaire.js';

// Médecins FICTIFS.
const liste = [
  { id: 'prac-fictif-a', nom: 'A [FICTIF]', specialite: 'Pédiatrie' },
  { id: 'prac-fictif-b', nom: 'B [FICTIF]', specialite: 'Médecine générale' },
  { id: 'prac-fictif-c', nom: 'C [FICTIF]', specialite: 'Pédiatrie ' },
  { id: 'prac-fictif-d', nom: 'D [FICTIF]' },
];

describe('annuaire par spécialité', () => {
  it('liste chaque spécialité une fois, dans l’ordre alphabétique', () => {
    expect(specialites(liste, 'fr-FR')).toEqual(['Médecine générale', 'Pédiatrie']);
    expect(specialites(liste.slice(3), 'fr-FR')).toEqual([]);
  });

  it('garde les médecins de la spécialité choisie, ou tous', () => {
    expect(filtrer(liste, 'Pédiatrie').map((p) => p.id)).toEqual([
      'prac-fictif-a',
      'prac-fictif-c',
    ]);
    expect(filtrer(liste, undefined)).toHaveLength(4);
  });
});
