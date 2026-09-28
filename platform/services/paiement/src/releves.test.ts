// Relevés mensuels des intervenants (ADR-0020). Données FICTIVES uniquement.
import type { Utilisateur } from '@mbolo/identite';
import { creerJournal } from '@mbolo/journal-securise';
import { describe, expect, it } from 'vitest';
import { DepotMemoire, type Paiement } from './depot.js';
import { FournisseurSimule } from './fournisseur.js';
import { DepotRelevesMemoire, ServiceReleves, debutDuMois } from './releves.js';
import { creerServeur } from './serveur.js';
import { ServicePaiement } from './service.js';

const comptable: Utilisateur = { sujet: 'u-r1', roles: ['validation-reversement'] };
const FUSEAU = 'Africa/Libreville';

function paiement(id: string, praticien: string | undefined, payeLe: string, montant = 10_000) {
  const d = new Date(payeLe);
  return {
    id,
    reference: `rdv-fictif-${id}`,
    sujet: 'u-p1',
    typeConsultation: 'generaliste',
    ...(praticien ? { praticien } : {}),
    montant,
    devise: 'XAF',
    statut: 'paye',
    tentative: `t-${id}`,
    creeLe: d,
    misAJourLe: d,
    payeLe: d,
  } as Paiement;
}

function monter(o: { ouvert?: boolean } = {}) {
  const depot = new DepotMemoire();
  depot.paiements.push(
    // Septembre 2026 (heure du pays) : deux consultations pour prac-1, une pour prac-2.
    paiement('p1', 'prac-fictif-1', '2026-09-02T09:00:00Z'),
    paiement('p2', 'prac-fictif-1', '2026-09-20T09:00:00Z'),
    paiement('p3', 'prac-fictif-2', '2026-09-21T09:00:00Z', 15_000),
    // 30/09 à 23 h 30 UTC = 1er octobre 00 h 30 au pays : relevé d'octobre.
    paiement('p4', 'prac-fictif-1', '2026-09-30T23:30:00Z'),
    // Paiement ancien, sans professionnel : hors relevé.
    paiement('p5', undefined, '2026-09-10T09:00:00Z'),
  );
  // Remboursement versé en septembre d'une consultation payée en août (à déduire).
  depot.paiements.push(paiement('p6', 'prac-fictif-2', '2026-08-28T09:00:00Z', 15_000));
  depot.remboursementsEnMemoire.push({
    id: 'r1',
    paiementId: 'p6',
    montant: 15_000,
    devise: 'XAF',
    statut: 'effectue',
    prepareLe: new Date('2026-09-05T09:00:00Z'),
    effectueLe: new Date('2026-09-06T09:00:00Z'),
  });
  const service = new ServiceReleves(
    new DepotRelevesMemoire(depot),
    { estActif: async (nom) => nom === 'reversements.professionnels' && o.ouvert !== false },
    { partPourcent: 55, fuseau: FUSEAU },
    () => new Date('2026-10-02T08:00:00Z'),
  );
  return { depot, service };
}

describe('relevés des intervenants (ADR-0020)', () => {
  it('par professionnel : consultations payées dans le mois du pays, remboursements, part à reverser', async () => {
    const { service } = monter();
    const releves = await service.duMois(comptable, '2026-09');
    expect(releves).toEqual([
      {
        praticien: 'prac-fictif-1',
        devise: 'XAF',
        consultations: 2,
        encaisse: 20_000,
        remboursements: 0,
        rembourse: 0,
        net: 20_000,
        aReverser: 11_000,
        aDeduire: 0,
      },
      {
        praticien: 'prac-fictif-2',
        devise: 'XAF',
        consultations: 1,
        encaisse: 15_000,
        remboursements: 1,
        rembourse: 15_000,
        net: 0,
        aReverser: 0,
        aDeduire: 0,
      },
    ]);
    // Le paiement du 1er octobre (heure du pays) est dans le relevé d'octobre.
    expect((await service.duMois(comptable, '2026-10'))[0]).toMatchObject({
      praticien: 'prac-fictif-1',
      consultations: 1,
    });
  });

  it('remboursement plus grand que les paiements du mois : rien à reverser, montant à déduire', async () => {
    const { service } = monter();
    const aout = await service.duMois(comptable, '2026-08');
    expect(aout).toEqual([
      expect.objectContaining({ praticien: 'prac-fictif-2', net: 15_000, aReverser: 8_250 }),
    ]);
    const { depot, service: s2 } = monter();
    depot.paiements.splice(2, 1); // plus de consultation de prac-2 en septembre
    const sept = (await s2.duMois(comptable, '2026-09')).find(
      (r) => r.praticien === 'prac-fictif-2',
    );
    expect(sept).toMatchObject({ net: -15_000, aReverser: 0, aDeduire: 8_250 });
  });

  it('refuse un autre rôle, un agent IA, la fonction fermée, un mois invalide ou à venir', async () => {
    const { service } = monter();
    for (const u of [
      { sujet: 'u-v1', roles: ['validation-remboursement'] },
      { sujet: 'u-ia', roles: ['validation-reversement', 'agent-ia'] },
    ] as Utilisateur[]) {
      await expect(service.duMois(u, '2026-09')).rejects.toMatchObject({ motif: 'interdit' });
    }
    await expect(
      monter({ ouvert: false }).service.duMois(comptable, '2026-09'),
    ).rejects.toMatchObject({ motif: 'desactive' });
    for (const mois of ['2026-13', '26-09', '2026-11']) {
      await expect(service.duMois(comptable, mois)).rejects.toMatchObject({ motif: 'mois' });
    }
  });

  it('début de mois à minuit dans le fuseau du pays', () => {
    expect(debutDuMois(2026, 10, FUSEAU).toISOString()).toBe('2026-09-30T23:00:00.000Z');
    expect(debutDuMois(2027, 1, 'UTC').toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(
      () =>
        new ServiceReleves(
          new DepotRelevesMemoire(new DepotMemoire()),
          { estActif: async () => true },
          { partPourcent: 0, fuseau: FUSEAU },
        ),
    ).toThrow();
  });

  it('route GET /releves : rôle requis, mois vérifié, sans cache, rien de personnel au journal', async () => {
    const { service } = monter();
    const lignes: string[] = [];
    const app = await creerServeur({
      verifierJeton: async (j) => {
        if (j === 'comptable') return comptable;
        if (j === 'patient') return { sujet: 'u-p1', roles: ['patient'] };
        throw new Error('jeton invalide');
      },
      verifierAppelant: async () => 'mbolo-teleconsultation-service',
      service: new ServicePaiement(
        new DepotMemoire(),
        new FournisseurSimule('x'.repeat(40)),
        {
          devise: 'XAF',
          prix: { generaliste: 10_000, specialiste: 15_000 },
          operateurs: ['airtel'],
          indicatif: '241',
        },
        { estActif: async () => true },
      ),
      releves: service,
      journal: creerJournal({ service: 'paiement', ecrire: (l) => lignes.push(l) }),
    });
    const lire = (jeton?: string, mois = '2026-09') =>
      app.inject({
        method: 'GET',
        url: `/releves?mois=${mois}`,
        headers: jeton ? { authorization: `Bearer ${jeton}` } : {},
      });
    expect((await lire()).statusCode).toBe(401);
    expect((await lire('patient')).statusCode).toBe(403);
    expect((await lire('comptable', 'septembre')).statusCode).toBe(400);
    const r = await lire('comptable');
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json<{ releves: unknown[] }>().releves).toHaveLength(2);
    expect(lignes.join('\n')).not.toContain('u-p1');
  });
});
