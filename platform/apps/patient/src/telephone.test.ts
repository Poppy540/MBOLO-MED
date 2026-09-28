import { describe, expect, it } from 'vitest';
import { numeroInternational } from './telephone.js';

// Numéros manifestement FICTIFS.
describe('numéro du proche au format international', () => {
  it('accepte espaces, points, tirets et le préfixe 00', () => {
    expect(numeroInternational('+33 0 00 00 00 09')).toBe('+33000000009');
    expect(numeroInternational('00241 00-00-00-00')).toBe('+24100000000');
    expect(numeroInternational('+1 (000) 000.0000')).toBe('+10000000000');
  });

  it('refuse un numéro local, trop court ou avec des lettres', () => {
    for (const n of ['00 00 00 00', '+241', '+0 00 00 00 00', '+33 0 00 AB 00 09', '']) {
      expect(numeroInternational(n)).toBeUndefined();
    }
  });
});
