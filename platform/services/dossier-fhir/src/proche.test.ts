import type { RelatedPerson } from 'fhir/r4.js';
import { describe, expect, it } from 'vitest';
import { procheInvite, verifierProche } from './proche.js';
import { valider } from './regles.js';

// Données FICTIVES.
const fiche = (): RelatedPerson =>
  procheInvite({
    patientId: 'fictif-patient-0001',
    prenom: 'Serge [FICTIF]',
    lien: 'CHILD',
    actif: false,
    env: 'dev',
  });
const regles = (r: RelatedPerson) => valider(r, 'dev').map((x) => x.regle);

describe('RelatedPerson — proche invité par le patient (ADR-0019)', () => {
  it('fiche minimale valide : inactive, rattachée au patient, prénom et lien', () => {
    const r = fiche();
    expect(valider(r, 'dev')).toEqual([]);
    expect(r.active).toBe(false);
    expect(r.patient.reference).toBe('Patient/fictif-patient-0001');
    expect(r.name).toEqual([{ given: ['Serge [FICTIF]'] }]);
  });

  it('refuse téléphone, adresse, naissance ou nom de famille (mbolo-proche-2)', () => {
    const r = fiche();
    expect(regles({ ...r, telecom: [{ system: 'phone', value: '+33 0 00 00 00 00' }] })).toContain(
      'mbolo-proche-2',
    );
    expect(regles({ ...r, birthDate: '1990-01-01' })).toContain('mbolo-proche-2');
    expect(regles({ ...r, address: [{ city: '[FICTIF]' }] })).toContain('mbolo-proche-2');
    expect(regles({ ...r, name: [{ family: 'Fictif', given: ['Serge'] }] })).toContain(
      'mbolo-proche-2',
    );
    expect(regles({ ...r, name: [{ given: [''] }] })).toContain('mbolo-proche-2');
  });

  it('exige un patient et un lien de la liste permise (mbolo-proche-1, -3)', () => {
    const r = fiche();
    expect(verifierProche({ ...r, patient: { reference: 'Group/x' } }).map((x) => x.regle)).toEqual(
      ['mbolo-proche-1'],
    );
    expect(
      regles({ ...r, relationship: [{ coding: [{ system: 'urn:autre', code: 'CHILD' }] }] }),
    ).toContain('mbolo-proche-3');
    expect(regles({ ...r, relationship: [] })).toContain('mbolo-proche-3');
  });
});
