import type { Practitioner } from 'fhir/r4.js';
import { describe, expect, it } from 'vitest';
import {
  EXTENSION_STATUT_VERIFICATION,
  praticien,
  praticienVerifie,
  statutVerification,
} from './praticien.js';
import { valider } from './regles.js';

// Données FICTIVES.
const inscription = {
  specialite: 'Médecine générale',
  numero: 'FICTIF-ORDRE-0001',
  ordre: 'Ordre des médecins [FICTIF]',
  debut: '2026-01-01',
  fin: '2027-01-01',
};
const verifie = (): Practitioner =>
  praticien({
    nom: 'Test',
    prenom: 'Médecin [FICTIF]',
    statut: 'verifie',
    inscription,
    env: 'dev',
  });
const regles = (p: Practitioner) => valider(p, 'dev').map((x) => x.regle);
const le = (jour: string) => new Date(`${jour}T12:00:00Z`);

describe('Practitioner — vérification du professionnel (ADR-0026)', () => {
  it('fiche vérifiée valide, active, avec son inscription', () => {
    const p = verifie();
    expect(valider(p, 'dev')).toEqual([]);
    expect(p.active).toBe(true);
    expect(statutVerification(p)).toBe('verifie');
    expect(p.qualification?.[0]?.issuer?.display).toBe('Ordre des médecins [FICTIF]');
  });

  it('fiche du candidat créée inactive, sans inscription', () => {
    const p = praticien({ nom: 'Candidat', prenom: 'Médecin', statut: 'a-verifier', env: 'dev' });
    expect(valider(p, 'dev')).toEqual([]);
    expect(p.active).toBe(false);
  });

  it('refuse une fiche active non vérifiée (mbolo-prat-1)', () => {
    for (const statut of ['a-verifier', 'refuse', 'suspendu'] as const) {
      const p = { ...praticien({ nom: 'T', prenom: 'M', statut, env: 'dev' }), active: true };
      expect(regles(p)).toContain('mbolo-prat-1');
    }
  });

  it('refuse « verifie » sans numéro, Ordre ou fin de validité (mbolo-prat-2)', () => {
    const p = verifie();
    const q = p.qualification?.[0];
    if (!q) throw new Error('qualification attendue');
    expect(regles({ ...p, qualification: undefined })).toContain('mbolo-prat-2');
    expect(regles({ ...p, qualification: [{ ...q, identifier: undefined }] })).toContain(
      'mbolo-prat-2',
    );
    expect(regles({ ...p, qualification: [{ ...q, issuer: undefined }] })).toContain(
      'mbolo-prat-2',
    );
    expect(regles({ ...p, qualification: [{ ...q, period: { start: '2026-01-01' } }] })).toContain(
      'mbolo-prat-2',
    );
  });

  it('refuse une fiche sans statut (refus par défaut)', () => {
    const p: Practitioner = { resourceType: 'Practitioner', meta: verifie().meta };
    expect(regles(p)).toContain('mbolo-praticien.statutVerification');
  });

  it('praticienVerifie : actif, vérifié et inscription encore valable', () => {
    expect(praticienVerifie(verifie(), le('2026-06-01'))).toBe(true);
    expect(praticienVerifie(verifie(), le('2027-01-01'))).toBe(true);
    // Échéance passée : plus dans l'annuaire, même si personne n'a encore changé le statut.
    expect(praticienVerifie(verifie(), le('2027-01-02'))).toBe(false);
    expect(praticienVerifie({ ...verifie(), active: false }, le('2026-06-01'))).toBe(false);
    expect(
      praticienVerifie(
        {
          ...verifie(),
          extension: [{ url: EXTENSION_STATUT_VERIFICATION, valueCode: 'suspendu' }],
        },
        le('2026-06-01'),
      ),
    ).toBe(false);
    // Fiche sans statut (ancienne fiche, ou statut non lisible) : refusée.
    expect(praticienVerifie({ ...verifie(), extension: undefined }, le('2026-06-01'))).toBe(false);
  });
});
