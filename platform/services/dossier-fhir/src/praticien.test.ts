import type { Practitioner } from 'fhir/r4.js';
import { describe, expect, it } from 'vitest';
import {
  EXTENSION_STATUT_VERIFICATION,
  declarationDe,
  declarationPraticien,
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

describe('Practitioner — déclaration du candidat (ADR-0026, 3b)', () => {
  // Données FICTIVES.
  const declaration = {
    specialite: 'pediatrie' as const,
    paysOrdre: 'GA',
    numeroOrdre: 'FICTIF-ORDRE-0002',
    langues: ['fr', 'fan', 'fr'],
  };
  const candidat = () => ({
    ...praticien({ nom: 'Candidat', prenom: 'Médecin', statut: 'a-verifier', env: 'dev' }),
    ...declarationPraticien(declaration),
  });

  it('fiche à vérifier valide avec sa déclaration, relue telle quelle (langues dédoublonnées)', () => {
    const p = candidat();
    expect(valider(p, 'dev')).toEqual([]);
    expect(p.qualification?.[0]?.code.text).toBe('Pédiatrie');
    expect(declarationDe(p)).toEqual({ ...declaration, langues: ['fr', 'fan'] });
  });

  it('une déclaration ne rend jamais vérifié : sans période, mbolo-prat-2 la refuse', () => {
    const p = candidat();
    expect(p.qualification?.[0]?.period).toBeUndefined();
    const forcee: Practitioner = {
      ...p,
      active: true,
      extension: [{ url: EXTENSION_STATUT_VERIFICATION, valueCode: 'verifie' }],
    };
    expect(regles(forcee)).toContain('mbolo-prat-2');
    expect(praticienVerifie(forcee, le('2026-10-28'))).toBe(false);
  });

  it('refuse une spécialité hors liste, un pays, un numéro ou des langues invalides', () => {
    const avec = (d: object) => () => declarationPraticien({ ...declaration, ...d } as never);
    expect(avec({ specialite: 'Chirurgie esthétique' })).toThrow('Spécialité');
    expect(avec({ paysOrdre: 'gab' })).toThrow('Pays');
    expect(avec({ numeroOrdre: '<script>' })).toThrow('Numéro');
    expect(avec({ numeroOrdre: '' })).toThrow('Numéro');
    expect(avec({ langues: [] })).toThrow('Langues');
    expect(avec({ langues: ['fr', 'français'] })).toThrow('Langues');
    expect(avec({ langues: ['fr', 'en', 'es', 'pt', 'ar', 'de', 'it'] })).toThrow('Langues');
  });

  it('fiche sans déclaration, ou inscription vérifiée en texte : rien à relire', () => {
    expect(
      declarationDe(praticien({ nom: 'C', prenom: 'M', statut: 'a-verifier', env: 'dev' })),
    ).toBeUndefined();
    expect(declarationDe(verifie())).toBeUndefined();
  });
});
