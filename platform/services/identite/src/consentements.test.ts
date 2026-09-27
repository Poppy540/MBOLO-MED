import { describe, expect, it } from 'vitest';
import {
  DepotMemoire,
  ErreurAcces,
  ErreurValidation,
  ServiceConsentements,
} from './consentements.js';
import type { Utilisateur } from './roles.js';

// Données FICTIVES.
const P1 = 'fictif-patient-0001';
const patient1: Utilisateur = { sujet: 'u-p1', roles: ['patient'], patientId: P1 };
const patient2: Utilisateur = {
  sujet: 'u-p2',
  roles: ['patient'],
  patientId: 'fictif-patient-0002',
};

const service = () =>
  new ServiceConsentements(new DepotMemoire(), 'dev', () => new Date('2026-09-27T08:00:00Z'));

const soins = {
  categorie: 'C-SOINS',
  mode: 'vocal',
  versionTexte: 'C-SOINS v0.1 (fr)',
  accepte: true,
} as const;

describe('ServiceConsentements', () => {
  it('enregistre un consentement conforme, horodaté, marqué fictif en dev', async () => {
    const s = service();
    const c = await s.enregistrer(patient1, P1, soins);
    expect(c.id).toBeDefined();
    expect(c.status).toBe('active');
    expect(c.dateTime).toBe('2026-09-27T08:00:00.000Z');
    expect(c.meta?.tag?.[0]?.code).toBe('fictif');
  });

  it('refuse d’enregistrer pour un autre patient', async () => {
    await expect(service().enregistrer(patient2, P1, soins)).rejects.toBeInstanceOf(ErreurAcces);
  });

  it('refuse un partage avec un proche sans bénéficiaire (mbolo-consent-1)', async () => {
    const e = await service()
      .enregistrer(patient1, P1, { ...soins, categorie: 'C-PROCHE' })
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurValidation);
    expect((e as ErreurValidation).regles).toContain('mbolo-consent-1');
  });

  it('révoque avec effet immédiat et conserve la ressource (inactive)', async () => {
    const s = service();
    const c = await s.enregistrer(patient1, P1, soins);
    const r = await s.revoquer(patient1, c.id ?? '');
    expect(r.status).toBe('inactive');
    const liste = await s.lister(patient1, P1);
    expect(liste).toHaveLength(1);
    expect(liste[0]?.status).toBe('inactive');
  });

  it('ne permet pas de révoquer le consentement d’un autre, sans révéler s’il existe', async () => {
    const s = service();
    const c = await s.enregistrer(patient1, P1, soins);
    await expect(s.revoquer(patient2, c.id ?? '')).rejects.toBeInstanceOf(ErreurAcces);
    await expect(s.revoquer(patient2, 'inexistant')).rejects.toBeInstanceOf(ErreurAcces);
  });
});
