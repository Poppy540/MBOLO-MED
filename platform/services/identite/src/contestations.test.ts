import { evenementAccesDossier } from '@mbolo/dossier-fhir';
import { describe, expect, it } from 'vitest';
import { ErreurAcces } from './consentements.js';
import { ErreurContestation, ServiceContestations } from './contestations.js';
import { JournalAccesMemoire } from './journal-acces.js';
import type { Utilisateur } from './roles.js';

// Données FICTIVES.
const patient: Utilisateur = { sujet: 'u-p1', roles: ['patient'], patientId: 'pat-fictif-001' };
const securite: Utilisateur = { sujet: 'u-securite', roles: ['responsable-securite'] };
const MAINTENANT = () => new Date('2026-11-12T08:00:00Z');

async function journal() {
  const j = new JournalAccesMemoire();
  const acces = (patientId: string, h: number, brisDeGlace = false) =>
    evenementAccesDossier({
      patientId,
      sujet: 'u-m1',
      roles: ['professionnel'],
      autorise: true,
      motifDecision: brisDeGlace ? 'bris-de-glace' : 'consentement-partage-pro',
      ...(brisDeGlace ? { brisDeGlace: { justification: 'Urgence [FICTIF]' } } : {}),
      source: 'identite',
      date: new Date(Date.UTC(2026, 10, 12, h)).toISOString(),
      env: 'dev',
    });
  await j.consigner(acces('pat-fictif-001', 2, true)); // trace-1
  await j.consigner(acces('pat-fictif-002', 3)); // trace-2 : autre patient
  return j;
}

describe('contestation d’un accès par le patient', () => {
  it('trace la contestation une seule fois et la remet au responsable sécurité', async () => {
    const j = await journal();
    const service = new ServiceContestations(j, 'dev', MAINTENANT);
    expect(await service.contester(patient, 'pat-fictif-001', 'trace-1')).toEqual({ cree: true });
    expect(await service.contester(patient, 'pat-fictif-001', 'trace-1')).toEqual({ cree: false });
    expect(j.traces.filter((t) => t.subtype?.[0]?.code === 'contestation-acces')).toHaveLength(1);

    const liste = await service.lister(securite);
    expect(liste).toEqual([
      {
        contestationId: 'trace-3',
        date: '2026-11-12T08:00:00.000Z',
        canal: 'patient',
        patientId: 'pat-fictif-001',
        acces: {
          traceId: 'trace-1',
          date: '2026-11-12T02:00:00.000Z',
          demandeur: 'u-m1',
          roles: ['professionnel'],
          autorise: true,
          motif: 'bris-de-glace',
          urgence: true,
        },
      },
    ]);
    // Aucune justification écrite ni texte libre dans la liste.
    expect(JSON.stringify(liste)).not.toContain('Urgence [FICTIF]');
  });

  it('refuse un accès d’un autre dossier, une contestation, ou une trace inconnue (404)', async () => {
    const j = await journal();
    const service = new ServiceContestations(j, 'dev', MAINTENANT);
    await service.contester(patient, 'pat-fictif-001', 'trace-1');
    for (const traceId of ['trace-2', 'trace-3', 'trace-inconnue']) {
      await expect(service.contester(patient, 'pat-fictif-001', traceId)).rejects.toBeInstanceOf(
        ErreurContestation,
      );
    }
  });

  it('seul le patient lui-même conteste ; seul le responsable sécurité liste', async () => {
    const service = new ServiceContestations(await journal(), 'dev', MAINTENANT);
    for (const u of [
      { sujet: 'u-p2', roles: ['patient'], patientId: 'pat-fictif-002' },
      { sujet: 'u-pr', roles: ['proche'], relatedPersonId: 'rp-fictif-1' },
      { sujet: 'u-a1', roles: ['assistance-patient'] },
      {
        sujet: 'u-ia',
        roles: ['patient', 'agent-ia'],
        patientId: 'pat-fictif-001',
        agent: { nom: 'agent-01', patientSession: 'pat-fictif-001' },
      },
    ] as Utilisateur[]) {
      await expect(service.contester(u, 'pat-fictif-001', 'trace-1')).rejects.toBeInstanceOf(
        ErreurAcces,
      );
    }
    for (const u of [patient, { sujet: 'u-r', roles: ['revue-acces'] }] as Utilisateur[]) {
      await expect(service.lister(u)).rejects.toBeInstanceOf(ErreurAcces);
    }
  });
});
