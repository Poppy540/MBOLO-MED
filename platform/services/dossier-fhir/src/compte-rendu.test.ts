import type { Composition } from 'fhir/r4.js';
import { describe, expect, it } from 'vitest';
import { compteRendu, texteSection } from './construire.js';
import { valider, verifierComposition } from './regles.js';

// Données FICTIVES.
const cr = () =>
  compteRendu({
    patientId: 'fictif-patient-0001',
    praticienId: 'fictif-praticien-0001',
    rendezVousId: 'fictif-rendez-vous-0001',
    date: '2026-10-01T08:25:00Z',
    sections: {
      motif: '[FICTIF] Toux <depuis> 5 jours & fièvre',
      conclusion: '[FICTIF] Conclusion du médecin test.',
      observations: '   ',
    },
    env: 'dev',
  });

describe('Composition — compte-rendu de téléconsultation', () => {
  it('construit un compte-rendu valide, sections non vides seulement, texte échappé', () => {
    const c = cr();
    expect(valider(c, 'dev')).toEqual([]);
    expect(c.section?.map((s) => s.code?.coding?.[0]?.code)).toEqual(['motif', 'conclusion']);
    expect(c.section?.[0]?.text?.div).toContain('&lt;depuis&gt;');
    expect(texteSection(c, 'motif')).toBe('[FICTIF] Toux <depuis> 5 jours & fièvre');
    expect(c.event?.[0]?.detail?.[0]?.reference).toBe('Appointment/fictif-rendez-vous-0001');
  });

  it('refuse un compte-rendu dont l’auteur est un agent IA ou le patient (mbolo-cr-1)', () => {
    for (const reference of ['Device/agent-01-accueil', 'Patient/fictif-patient-0001']) {
      const c: Composition = { ...cr(), author: [{ reference }] };
      expect(verifierComposition(c).map((v) => v.regle)).toContain('mbolo-cr-1');
    }
    const deux: Composition = {
      ...cr(),
      author: [...cr().author, { reference: 'Practitioner/fictif-praticien-0002' }],
    };
    expect(verifierComposition(deux).map((v) => v.regle)).toContain('mbolo-cr-1');
  });

  it('refuse un compte-rendu vide', () => {
    expect(() =>
      compteRendu({
        patientId: 'p',
        praticienId: 'q',
        rendezVousId: 'r',
        date: '2026-10-01T08:25:00Z',
        sections: {},
        env: 'dev',
      }),
    ).toThrow();
  });
});
