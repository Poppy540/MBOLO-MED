import { describe, expect, it } from 'vitest';
import { creerJournal } from './journal.js';
import { DONNEE_MASQUEE, SECRET_MASQUE } from './masquer.js';

describe('creerJournal', () => {
  it('écrit une ligne JSON masquée avec horodatage, niveau et service [FICTIF]', () => {
    const lignes: string[] = [];
    const journal = creerJournal({
      service: 'identite',
      ecrire: (l) => lignes.push(l),
      maintenant: () => new Date('2026-09-26T10:00:00Z'),
    });

    journal.info('consentement enregistré', {
      patientId: 'fictif-0001',
      nom: 'Test',
      token: 'fictif',
    });

    expect(lignes).toHaveLength(1);
    expect(JSON.parse(lignes[0] ?? '')).toEqual({
      horodatage: '2026-09-26T10:00:00.000Z',
      niveau: 'info',
      service: 'identite',
      message: 'consentement enregistré',
      contexte: { patientId: 'fictif-0001', nom: DONNEE_MASQUEE, token: SECRET_MASQUE },
    });
  });

  it('masque aussi le message lui-même', () => {
    const lignes: string[] = [];
    const journal = creerJournal({ service: 'x', ecrire: (l) => lignes.push(l) });
    journal.erreur('échec envoi SMS au +241 00 00 00 00');
    expect(lignes[0]).not.toContain('00 00 00');
  });
});
