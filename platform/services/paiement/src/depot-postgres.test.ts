// Intégration sur un vrai PostgreSQL (local ou CI, données de test uniquement) : migration réelle,
// rôle d'exécution restreint, une seule collecte et une seule conclusion face à des requêtes simultanées.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connecter, migrer, roleDe, type Sql } from '@mbolo/base-donnees';
import { DepotPostgres, type Paiement } from './depot.js';

const URL_MIGRATION = process.env['MBOLO_TEST_DATABASE_URL'];
const URL_EXECUTION = process.env['MBOLO_TEST_DATABASE_URL_EXECUTION'];

describe.runIf(URL_MIGRATION && URL_EXECUTION)('dépôt PostgreSQL des paiements', () => {
  let proprietaire: Sql;
  let execution: Sql;
  let depot: DepotPostgres;

  // [FICTIF] Référence propre à cette exécution : les données précédentes ne gênent pas.
  const nouveau = (): Paiement => {
    const maintenant = new Date();
    return {
      id: randomUUID(),
      reference: `rdv-essai-${randomUUID().slice(0, 8)}`,
      sujet: 'sujet-patient-fictif',
      typeConsultation: 'generaliste',
      montant: 10_000,
      devise: 'XAF',
      statut: 'a-payer',
      creeLe: maintenant,
      misAJourLe: maintenant,
    };
  };

  beforeAll(async () => {
    proprietaire = connecter({ url: URL_MIGRATION ?? '', application: 'essai', production: false });
    execution = connecter({ url: URL_EXECUTION ?? '', application: 'essai', production: false });
    const dossier = new URL('../migrations/', import.meta.url);
    await migrer({
      sql: proprietaire,
      schema: 'paiement',
      roleExecution: roleDe(URL_EXECUTION ?? ''),
      migrations: readdirSync(dossier).map((nom) => ({
        nom,
        sql: readFileSync(new URL(nom, dossier), 'utf8'),
      })),
    });
    depot = new DepotPostgres(execution);
  });

  afterAll(async () => {
    await Promise.all([proprietaire.end(), execution.end()]);
  });

  it('crée un seul paiement par rendez-vous, même en simultané', async () => {
    const p = nouveau();
    const crees = await Promise.all(
      Array.from({ length: 6 }, () => depot.creer({ ...p, id: randomUUID() })),
    );
    expect(new Set(crees.map((c) => c.id)).size).toBe(1);
    expect(crees[0]?.montant).toBe(10_000);
  });

  it('une seule collecte démarre face à des demandes simultanées, une seule conclusion', async () => {
    const p = await depot.creer(nouveau());
    const demarrages = await Promise.all(
      Array.from({ length: 8 }, () =>
        depot.demarrer(
          p.id,
          { tentative: randomUUID(), operateur: 'airtel', fournisseur: 'simule' },
          new Date(),
        ),
      ),
    );
    const gagnants = demarrages.filter(Boolean);
    expect(gagnants).toHaveLength(1);
    const tentative = gagnants[0]?.tentative ?? '';
    const conclusions = await Promise.all([
      depot.conclure(tentative, 'paye', new Date()),
      depot.conclure(tentative, 'echoue', new Date()),
    ]);
    expect(conclusions.filter(Boolean)).toHaveLength(1);
    const final = await depot.trouver(p.id);
    expect(['paye', 'echoue']).toContain(final?.statut);
    expect(final?.statut === 'paye').toBe(Boolean(final?.payeLe));
  });

  it('le service ne peut rien supprimer', async () => {
    const p = await depot.creer(nouveau());
    await expect(execution`delete from paiement.paiements where id = ${p.id}`).rejects.toThrow(
      /permission/,
    );
  });

  it('un seul remboursement par paiement, une seule décision, aucune collecte après annulation', async () => {
    const p = await depot.creer(nouveau());
    const tentative = randomUUID();
    await depot.demarrer(
      p.id,
      { tentative, operateur: 'airtel', fournisseur: 'simule' },
      new Date(),
    );
    await depot.conclure(tentative, 'paye', new Date());
    await depot.annuler(p.reference, new Date());
    expect((await depot.payesAnnulesSansRemboursement()).map((x) => x.id)).toContain(p.id);

    const preparations = await Promise.all(
      Array.from({ length: 6 }, () =>
        depot.preparerRemboursement({
          id: randomUUID(),
          paiementId: p.id,
          montant: p.montant,
          devise: p.devise,
          statut: 'a-valider',
          prepareLe: new Date(),
        }),
      ),
    );
    const prepares = preparations.filter(Boolean);
    expect(prepares).toHaveLength(1);
    const id = prepares[0]?.id ?? '';
    const decisions = await Promise.all([
      depot.deciderRemboursement(id, 'valide', 'sujet-valideur-fictif-1', new Date()),
      depot.deciderRemboursement(id, 'refuse', 'sujet-valideur-fictif-2', new Date()),
    ]);
    expect(decisions.filter(Boolean)).toHaveLength(1);

    // Rendez-vous annulé : plus aucune collecte, même après un échec.
    const q = await depot.creer(nouveau());
    await depot.annuler(q.reference, new Date());
    expect(
      await depot.demarrer(
        q.id,
        { tentative: randomUUID(), operateur: 'airtel', fournisseur: 'simule' },
        new Date(),
      ),
    ).toBeUndefined();
    await expect(execution`delete from paiement.remboursements where id = ${id}`).rejects.toThrow(
      /permission/,
    );
  });
});
