import { describe, expect, it } from 'vitest';
import { autorise, lireElements, lirePermissions, restreindre } from './permissions.js';

describe('permissions SMART', () => {
  it('lit les permissions system/<Type>.<cruds>', () => {
    const p = lirePermissions('system/Consent.crus system/Patient.r');
    expect(autorise(p, 'Consent', 'c')).toBe(true);
    expect(autorise(p, 'Consent', 's')).toBe(true);
    expect(autorise(p, 'Consent', 'd')).toBe(false);
    expect(autorise(p, 'Patient', 'r')).toBe(true);
    expect(autorise(p, 'Patient', 's')).toBe(false);
  });

  it('refuse par défaut : entrées mal formées, portées patient/utilisateur, jokers', () => {
    const p = lirePermissions(
      'system/*.cruds patient/Consent.r user/Condition.r system/consent.r openid',
    );
    expect(p.size).toBe(0);
    expect(autorise(lirePermissions(undefined), 'Consent', 'r')).toBe(false);
  });
});

describe('éléments autorisés (minimisation)', () => {
  it('lit « Type.element » et ignore les entrées mal formées', () => {
    const e = lireElements('Patient.telecom Practitioner.telecom patient.name Patient.* Patient');
    expect([...e.keys()]).toEqual(['Patient', 'Practitioner']);
    expect([...(e.get('Patient') ?? [])]).toEqual(['telecom']);
  });

  it('ne garde que type, identifiant, métadonnées et éléments autorisés', () => {
    const e = lireElements('Patient.telecom');
    const p = {
      resourceType: 'Patient',
      id: 'pat-fictif-001',
      meta: { versionId: '1' },
      name: [{ text: '[FICTIF]' }],
      birthDate: '1990-01-01',
      telecom: [{ system: 'phone', value: '+241 00 00 00 00' }],
    };
    expect(restreindre(p, e)).toEqual({
      resourceType: 'Patient',
      id: 'pat-fictif-001',
      meta: { versionId: '1' },
      telecom: [{ system: 'phone', value: '+241 00 00 00 00' }],
    });
    // Un type non restreint est renvoyé tel quel.
    const c = { resourceType: 'Consent', id: 'c1', status: 'active' };
    expect(restreindre(c, e)).toBe(c);
  });
});
