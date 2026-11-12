import { evenementAccesDossier, revueBrisDeGlace } from '@mbolo/dossier-fhir';
import { describe, expect, it } from 'vitest';
import { ErreurAcces } from './consentements.js';
import { JournalAccesMemoire } from './journal-acces.js';
import type { Utilisateur } from './roles.js';
import { ErreurPeriode, ServiceTracesCompte } from './traces-compte.js';

// Données FICTIVES.
const securite: Utilisateur = { sujet: 'u-securite', roles: ['responsable-securite'] };
const heure = (h: number) => new Date(Date.UTC(2026, 10, 2, h)).toISOString();
const MAINTENANT = () => new Date(heure(12));

async function journal() {
  const j = new JournalAccesMemoire();
  const acces = (sujet: string, h: number, patientId: string, autorise: boolean) =>
    evenementAccesDossier({
      patientId,
      sujet,
      roles: ['professionnel'],
      autorise,
      motifDecision: autorise ? 'consentement-partage-pro' : 'refus-par-defaut',
      source: 'identite',
      date: heure(h),
      env: 'dev',
    });
  await j.consigner(acces('u-vole', 1, 'pat-fictif-001', true)); // avant la période
  await j.consigner(acces('u-vole', 3, 'pat-fictif-002', true));
  await j.consigner(acces('u-vole', 3, 'pat-fictif-003', false)); // refus : rien de lu
  await j.consigner(acces('u-vole', 4, 'pat-fictif-002', true)); // même dossier, une seule fois
  await j.consigner(acces('u-autre', 4, 'pat-fictif-004', true)); // autre compte
  await j.consigner(
    revueBrisDeGlace({
      traceId: 'trace-1',
      sujet: 'u-vole',
      conclusion: 'justifie',
      date: heure(5),
      env: 'dev',
    }),
  );
  return j;
}

describe('traces d’un compte (plan d’incident)', () => {
  it('liste les traces du compte depuis la date, plus récentes d’abord, et les dossiers accordés', async () => {
    const r = await new ServiceTracesCompte(await journal(), MAINTENANT).lister(
      securite,
      'u-vole',
      heure(2),
    );
    expect(r.traces.map((t) => [t.date, t.type, t.cible, t.autorise])).toEqual([
      [heure(5), 'revue-bris-de-glace', 'AuditEvent/trace-1', true],
      [heure(4), 'acces-dossier', 'Patient/pat-fictif-002', true],
      [heure(3), 'acces-dossier', 'Patient/pat-fictif-002', true],
      [heure(3), 'acces-dossier', 'Patient/pat-fictif-003', false],
    ]);
    expect(r.traces[1]).toMatchObject({
      motif: 'consentement-partage-pro',
      source: 'identite',
      roles: ['professionnel'],
    });
    expect(r.dossiersAccordes).toEqual(['pat-fictif-002']);
  });

  it('réservé au responsable sécurité, jamais à un agent IA', async () => {
    const service = new ServiceTracesCompte(await journal(), MAINTENANT);
    for (const u of [
      { sujet: 'u-m1', roles: ['professionnel'] },
      { sujet: 'u-r1', roles: ['revue-acces'] },
      { sujet: 'u-a1', roles: ['assistance-patient'] },
      { sujet: 'u-ia', roles: ['responsable-securite', 'agent-ia'] },
      {
        sujet: 'u-ia2',
        roles: ['responsable-securite'],
        agent: { nom: 'agent-04', patientSession: 'pat-fictif-001' },
      },
    ] as Utilisateur[]) {
      await expect(service.lister(u, 'u-vole', heure(2))).rejects.toBeInstanceOf(ErreurAcces);
    }
  });

  it('refuse une date invalide, future ou de plus de 30 jours', async () => {
    const service = new ServiceTracesCompte(await journal(), MAINTENANT);
    for (const depuis of ['pas-une-date', heure(13), '2026-10-01T00:00:00Z']) {
      await expect(service.lister(securite, 'u-vole', depuis)).rejects.toBeInstanceOf(
        ErreurPeriode,
      );
    }
    await expect(service.lister(securite, 'u-vole', '2026-10-04T00:00:00Z')).resolves.toBeDefined();
  });
});
