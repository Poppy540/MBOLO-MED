import { evenementAccesDossier } from '@mbolo/dossier-fhir';
import { describe, expect, it } from 'vitest';
import { ErreurAcces } from './consentements.js';
import { JournalAccesMemoire } from './journal-acces.js';
import { ErreurRevue, ServiceRevue } from './revue.js';
import type { Utilisateur } from './roles.js';

// Données FICTIVES.
const relecteur: Utilisateur = { sujet: 'u-relecteur', roles: ['revue-acces'] };
const medecin: Utilisateur = { sujet: 'u-m1', roles: ['professionnel'] };
const heure = (h: number) => new Date(Date.UTC(2026, 8, 27, h)).toISOString();

async function journalAvecUrgences() {
  const j = new JournalAccesMemoire();
  const acces = (sujet: string, h: number, brisDeGlace: boolean, autorise = true) =>
    evenementAccesDossier({
      patientId: 'pat-fictif-001',
      sujet,
      roles: ['professionnel'],
      autorise,
      motifDecision: brisDeGlace ? 'bris-de-glace' : 'consentement-partage-pro',
      ...(brisDeGlace ? { brisDeGlace: { justification: `Urgence ${h} h [FICTIF]` } } : {}),
      source: 'identite',
      date: heure(h),
      env: 'dev',
    });
  await j.consigner(acces('u-m1', 1, true)); // trace-1 : ancien, en retard
  await j.consigner(acces('u-m1', 20, true)); // trace-2 : récent
  await j.consigner(acces('u-m1', 21, false)); // accès ordinaire : pas à revoir
  await j.consigner(acces('u-relecteur', 22, true)); // trace-4 : accès du relecteur lui-même
  return j;
}

describe('revue des bris de glace', () => {
  it('liste les accès d’urgence à revoir, les plus récents d’abord, et signale le retard', async () => {
    const service = new ServiceRevue(
      await journalAvecUrgences(),
      'dev',
      24,
      () => new Date(heure(26)),
    );
    const liste = await service.lister(relecteur, 'a-revoir');
    expect(liste.map((x) => x.traceId)).toEqual(['trace-4', 'trace-2', 'trace-1']);
    expect(liste.find((x) => x.traceId === 'trace-1')).toMatchObject({
      enRetard: true,
      patientId: 'pat-fictif-001',
      demandeur: 'u-m1',
      justification: 'Urgence 1 h [FICTIF]',
    });
    expect(liste.find((x) => x.traceId === 'trace-2')?.enRetard).toBe(false);
  });

  it('enregistre la revue : l’accès sort de la liste « à revoir », reste dans « toutes »', async () => {
    const service = new ServiceRevue(
      await journalAvecUrgences(),
      'dev',
      24,
      () => new Date(heure(26)),
    );
    await service.revoir(relecteur, 'trace-1', 'injustifie', 'Aucune urgence documentée [FICTIF]');
    expect((await service.lister(relecteur, 'a-revoir')).map((x) => x.traceId)).not.toContain(
      'trace-1',
    );
    expect(
      (await service.lister(relecteur, 'toutes')).find((x) => x.traceId === 'trace-1')?.revue,
    ).toMatchObject({
      conclusion: 'injustifie',
      commentaire: 'Aucune urgence documentée [FICTIF]',
    });
    // Une seule revue par accès.
    await expect(service.revoir(relecteur, 'trace-1', 'justifie')).rejects.toMatchObject({
      statut: 409,
    });
  });

  it('refus : autre rôle, accès inconnu, revue de son propre accès d’urgence', async () => {
    const service = new ServiceRevue(await journalAvecUrgences(), 'dev', 24);
    await expect(service.lister(medecin, 'a-revoir')).rejects.toBeInstanceOf(ErreurAcces);
    await expect(service.revoir(relecteur, 'inconnu', 'justifie')).rejects.toBeInstanceOf(
      ErreurRevue,
    );
    await expect(service.revoir(relecteur, 'trace-4', 'justifie')).rejects.toBeInstanceOf(
      ErreurAcces,
    );
  });
});
