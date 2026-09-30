import { describe, expect, it } from 'vitest';
import { numerosSecours } from './secours.js';

// Numéros manifestement FICTIFS : les vrais numéros sont fournis au déploiement.
describe('numéros des secours du pays', () => {
  it('lit « Nom:numéro » séparés par des virgules', () => {
    expect(numerosSecours('Secours fictif:00, Autre secours:+000 000')).toEqual([
      { nom: 'Secours fictif', numero: '00' },
      { nom: 'Autre secours', numero: '+000000' },
    ]);
  });

  it('ignore une entrée mal formée plutôt que de proposer un appel douteux', () => {
    for (const t of ['', 'Sans numéro', ':00', 'Secours:abc', 'Secours:0', 'Secours:<b>00']) {
      expect(numerosSecours(t)).toEqual([]);
    }
    expect(numerosSecours('Secours:00,Faux:tel:00')).toEqual([{ nom: 'Secours', numero: '00' }]);
  });
});
