import { describe, expect, it } from 'vitest';
import { ALERTES, signalerAlerte } from './alertes.js';
import { creerJournal, type Evenement } from './journal.js';

const journal = () => {
  const lignes: Evenement[] = [];
  const j = creerJournal({
    service: 'essai',
    ecrire: (l) => lignes.push(JSON.parse(l) as Evenement),
  });
  return { j, lignes };
};

describe('événements d’alerte', () => {
  it('écrit un champ alerte stable, au bon niveau, sans pouvoir être écrasé', () => {
    const { j, lignes } = journal();
    signalerAlerte(j, 'consultation-photo', 'photo consultée', {
      sujet: 'u-v1',
      alerte: 'autre',
    });
    signalerAlerte(j, 'erreur-serveur', 'erreur interne');
    expect(lignes.map((l) => [l.niveau, (l.contexte as { alerte: string }).alerte])).toEqual([
      ['avertissement', 'consultation-photo'],
      ['erreur', 'erreur-serveur'],
    ]);
  });

  it('masque les données sensibles du contexte comme le reste du journal', () => {
    const { j, lignes } = journal();
    signalerAlerte(j, 'acces-refuse', 'refus', {
      sujet: 'u-p1',
      telephone: '+241 00 00 00 00',
    });
    const texte = JSON.stringify(lignes);
    expect(texte).not.toContain('+241 00 00 00 00');
    expect(texte).toContain('"alerte":"acces-refuse"');
  });

  it('nomme les alertes en minuscules avec tirets (règles de supervision)', () => {
    for (const a of ALERTES) expect(a).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});
