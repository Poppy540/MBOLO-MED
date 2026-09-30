import { describe, expect, it } from 'vitest';
import { patientInscrit } from './construire.js';
import { EXTENSION_CHANGEMENT_TELEPHONE } from './constantes.js';
import { valider } from './regles.js';
import { changementTelephone, enAttenteApresPerte, telephoneChange } from './telephone.js';

// Numéros FICTIFS, manifestement inventés.
const patient = patientInscrit({
  nom: 'Test',
  prenom: 'Patient G',
  naissance: '1991-02-03',
  telephone: '+241 00 00 00 01',
  env: 'dev',
});
const le = new Date('2026-09-30T08:00:00Z');
const heures = (h: number) => new Date(le.getTime() + h * 3_600_000);

describe('numéro changé (ADR-0023)', () => {
  it('porte le parcours et la date du changement, et reste conforme au profil', () => {
    const t = telephoneChange('+241 00 00 00 07', 'perte', le);
    expect(t).toMatchObject({
      system: 'phone',
      use: 'mobile',
      period: { start: le.toISOString() },
    });
    expect(changementTelephone(t)).toEqual({ parcours: 'perte', le });
    expect(valider({ ...patient, telecom: [t] }, 'dev')).toEqual([]);
  });

  it('bloque les codes de connexion 24 heures après une perte, jamais après un changement par le patient', () => {
    const perte = telephoneChange('+241 00 00 00 07', 'perte', le);
    expect(enAttenteApresPerte(perte, heures(1))).toBe(true);
    expect(enAttenteApresPerte(perte, heures(23.9))).toBe(true);
    expect(enAttenteApresPerte(perte, heures(24))).toBe(false);
    expect(enAttenteApresPerte(telephoneChange('+241 00 00 00 07', 'patient', le), heures(1))).toBe(
      false,
    );
    // Numéro jamais changé : aucune attente.
    expect(enAttenteApresPerte({ system: 'phone', value: '+241 00 00 00 01' }, heures(1))).toBe(
      false,
    );
  });

  it('refuse un numéro changé sans date (mbolo-pat-3) ou avec un parcours inconnu', () => {
    const sansDate = { ...telephoneChange('+241 00 00 00 07', 'perte', le), period: undefined };
    expect(valider({ ...patient, telecom: [sansDate] }, 'dev')).toContainEqual(
      expect.objectContaining({ regle: 'mbolo-pat-3' }),
    );
    const inconnu = {
      ...telephoneChange('+241 00 00 00 07', 'perte', le),
      extension: [{ url: EXTENSION_CHANGEMENT_TELEPHONE, valueCode: 'equipe' }],
    };
    expect(valider({ ...patient, telecom: [inconnu] }, 'dev')).toContainEqual(
      expect.objectContaining({ regle: 'mbolo-patient.changementTelephone' }),
    );
    // Sans date lisible, pas de blocage à tort : la règle refuse déjà l'écriture.
    expect(changementTelephone(sansDate)).toBeUndefined();
  });
});
