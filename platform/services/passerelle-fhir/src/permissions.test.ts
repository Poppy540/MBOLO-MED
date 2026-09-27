import { describe, expect, it } from 'vitest';
import { autorise, lirePermissions } from './permissions.js';

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
