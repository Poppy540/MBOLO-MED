import { describe, expect, it } from 'vitest';
import { clesManquantes, creerTraducteur } from './textes.js';

// Textes FICTIFS de démonstration ; la « traduction » est marquée comme telle.
const reference = {
  bonjour: 'Bonjour {nom}',
  retour: 'Retour',
  rendezVous: { one: '{nombre} rendez-vous prévu', other: '{nombre} rendez-vous prévus' },
} as const;

describe('creerTraducteur (ADR-0025)', () => {
  it('rend le texte de référence et place les valeurs', () => {
    const t = creerTraducteur(reference, 'fr-FR');
    expect(t('retour')).toBe('Retour');
    expect(t('bonjour', { nom: 'Ada [FICTIF]' })).toBe('Bonjour Ada [FICTIF]');
  });

  it('choisit la forme du pluriel selon la langue', () => {
    const t = creerTraducteur(reference, 'fr-FR');
    expect(t('rendezVous', { nombre: 0 })).toBe('0 rendez-vous prévu');
    expect(t('rendezVous', { nombre: 1 })).toBe('1 rendez-vous prévu');
    expect(t('rendezVous', { nombre: 2 })).toBe('2 rendez-vous prévus');
    // En anglais, 0 prend la forme « other ».
    expect(creerTraducteur(reference, 'en')('rendezVous', { nombre: 0 })).toBe(
      '0 rendez-vous prévus',
    );
  });

  it('une clé non traduite s’affiche dans la langue de référence, jamais vide', () => {
    const t = creerTraducteur(reference, 'en', { retour: 'Back [FICTIF]' });
    expect(t('retour')).toBe('Back [FICTIF]');
    expect(t('bonjour', { nom: 'Ada' })).toBe('Bonjour Ada');
    expect(clesManquantes(reference, { retour: 'Back [FICTIF]' })).toEqual([
      'bonjour',
      'rendezVous',
    ]);
  });

  it('une valeur oubliée reste visible au lieu de disparaître', () => {
    expect(creerTraducteur(reference, 'fr')('bonjour')).toBe('Bonjour {nom}');
  });

  it('une langue inconnue du navigateur suit les règles de pluriel du français', () => {
    const t = creerTraducteur(reference, 'langue-inconnue-zz');
    expect(t('rendezVous', { nombre: 1 })).toBe('1 rendez-vous prévu');
  });
});
