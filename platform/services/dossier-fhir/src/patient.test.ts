import { describe, expect, it } from 'vitest';
import { changerStatutIdentite, patientInscrit, statutIdentite } from './construire.js';
import { valider, verifierPatient } from './regles.js';

// Identités FICTIVES, numéros manifestement inventés.
const base = {
  nom: 'Test',
  prenom: 'Patiente D',
  naissance: '1992-03-04',
  telephone: '+241 00 00 00 01',
  env: 'dev' as const,
};

describe('patient inscrit avec un code (ADR-0014)', () => {
  it('commence avec une identité « à vérifier », marquée fictive hors production', () => {
    const p = patientInscrit(base);
    expect(statutIdentite(p)).toBe('a-verifier');
    expect(valider(p, 'dev')).toEqual([]);
    expect(p.meta?.tag?.[0]?.code).toBe('fictif');
    expect(p).not.toHaveProperty('gender');
  });

  it('exige nom, prénom et date de naissance valable', () => {
    expect(verifierPatient({ ...patientInscrit(base), name: [{ family: 'Test' }] })).toContainEqual(
      expect.objectContaining({ regle: 'mbolo-pat-1' }),
    );
    const sansNaissance = patientInscrit(base);
    delete sansNaissance.birthDate;
    expect(verifierPatient(sansNaissance)).toContainEqual(
      expect.objectContaining({ regle: 'mbolo-patient.birthDate' }),
    );
    expect(verifierPatient(patientInscrit({ ...base, naissance: '2999-01-01' }))).toContainEqual(
      expect.objectContaining({ regle: 'mbolo-patient.birthDate' }),
    );
  });

  it('refuse une identité vérifiée sans numéro d’assurance maladie ou provisoire', () => {
    const sans = changerStatutIdentite(patientInscrit(base), 'verifiee');
    expect(verifierPatient(sans)).toContainEqual(expect.objectContaining({ regle: 'mbolo-pat-2' }));
    const avec = changerStatutIdentite(
      patientInscrit({
        ...base,
        identifiant: {
          type: 'provisoire',
          systeme: 'https://mbolo-sante.example/fhir/identifiant/ga/provisoire',
          valeur: 'FICTIF-PROV-0001',
        },
      }),
      'verifiee',
    );
    expect(verifierPatient(avec)).toEqual([]);
    expect(statutIdentite(avec)).toBe('verifiee');
  });

  it('garde un seul statut de vérification', () => {
    const p = changerStatutIdentite(
      changerStatutIdentite(patientInscrit(base), 'refusee'),
      'a-verifier',
    );
    expect(p.extension).toHaveLength(1);
    expect(
      verifierPatient({ ...p, extension: [...(p.extension ?? []), ...(p.extension ?? [])] }),
    ).toContainEqual(expect.objectContaining({ regle: 'mbolo-patient.statutIdentite' }));
  });
});
