import { describe, expect, it } from 'vitest';
import { evenementAccesDossier } from './construire.js';
import { valider } from './regles.js';

// Données FICTIVES.
const base = {
  patientId: 'pat-fictif-001',
  sujet: 'compte-fictif-medecin',
  roles: ['professionnel'],
  source: 'identite',
  date: '2026-09-27T08:00:00Z',
  env: 'dev' as const,
};

describe('AuditEvent — journal des accès au dossier', () => {
  it('trace un accès accordé : lecture du dossier du patient, motif, demandeur par identifiant technique', () => {
    const e = evenementAccesDossier({
      ...base,
      autorise: true,
      motifDecision: 'consentement-partage-pro',
    });
    expect(e).toMatchObject({
      resourceType: 'AuditEvent',
      action: 'R',
      outcome: '0',
      outcomeDesc: 'consentement-partage-pro',
      entity: [{ what: { reference: 'Patient/pat-fictif-001' } }],
    });
    expect(e.agent[0]?.who?.identifier?.value).toBe('compte-fictif-medecin');
    expect(e.agent[0]?.who?.display).toBeUndefined();
    expect(e.purposeOfEvent?.[0]?.coding?.[0]?.code).toBe('TREAT');
    expect(valider(e, 'dev')).toEqual([]);
  });

  it('trace aussi un refus', () => {
    const e = evenementAccesDossier({
      ...base,
      autorise: false,
      motifDecision: 'refus-par-defaut',
    });
    expect(e.outcome).toBe('4');
  });

  it('bris de glace : motif « urgence » et justification conservée pour la revue humaine', () => {
    const e = evenementAccesDossier({
      ...base,
      autorise: true,
      motifDecision: 'bris-de-glace',
      brisDeGlace: { justification: 'Patient inconscient aux urgences [FICTIF]' },
    });
    expect(e.purposeOfEvent?.[0]?.coding?.[0]?.code).toBe('ETREAT');
    expect(e.entity?.[0]?.detail?.[0]).toEqual({
      type: 'justification-bris-de-glace',
      valueString: 'Patient inconscient aux urgences [FICTIF]',
    });
  });

  it('hors production, marqué fictif (sinon refusé par les règles)', () => {
    const e = evenementAccesDossier({ ...base, autorise: true, motifDecision: 'patient-lui-meme' });
    expect(valider({ ...e, meta: {} }, 'dev').map((v) => v.regle)).toContain('mbolo-fictif');
  });
});
