import { describe, expect, it } from 'vitest';
import { jeuFictif } from './donnees-fictives.js';
import { MARQUEUR_FICTIF } from './constantes.js';
import { valider } from './regles.js';

describe('jeuFictif', () => {
  const bundle = jeuFictif();
  const ressources = (bundle.entry ?? []).map((e) => e.resource).filter((r) => r !== undefined);

  it('est un Bundle transaction non vide', () => {
    expect(bundle.type).toBe('transaction');
    expect(ressources.length).toBeGreaterThan(5);
  });

  it('chaque ressource porte le marqueur fictif et respecte les règles Mbolo', () => {
    for (const r of ressources) {
      expect(r.meta?.tag).toContainEqual(MARQUEUR_FICTIF);
      expect(valider(r, 'dev')).toEqual([]);
    }
  });

  it('ne contient aucun numéro de téléphone autre que le numéro fictif +241 00 00 00 00', () => {
    const texte = JSON.stringify(bundle);
    const numeros = texte.match(/\+241[\d ]+/g) ?? [];
    expect(numeros.every((n) => n.trim() === '+241 00 00 00 00')).toBe(true);
  });
});
