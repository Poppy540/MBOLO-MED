// Intégration sur un vrai PostgreSQL (local ou CI, données de test uniquement) : migration réelle,
// rôle d'exécution restreint, quota et usage unique atomiques face à des requêtes simultanées.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connecter, migrer, roleDe, type Sql } from '@mbolo/base-donnees';
import { creerEmpreinte } from './codes.js';
import { DepotPostgres } from './depot.js';
import { ServiceInvitations } from './service.js';

const URL_MIGRATION = process.env['MBOLO_TEST_DATABASE_URL'];
const URL_EXECUTION = process.env['MBOLO_TEST_DATABASE_URL_EXECUTION'];

describe.runIf(URL_MIGRATION && URL_EXECUTION)('dépôt PostgreSQL des invitations', () => {
  let proprietaire: Sql;
  let execution: Sql;
  // Cohorte propre à cette exécution : les données des exécutions précédentes ne gênent pas.
  const cohorte = `essai-${randomUUID().slice(0, 8)}`;
  const empreinte = creerEmpreinte('essai-'.repeat(8));
  const service = (quota: number) =>
    new ServiceInvitations(new DepotPostgres(execution), empreinte, {
      cohortes: [cohorte],
      quotaParCohorte: quota,
      validiteJours: 14,
    });

  beforeAll(async () => {
    proprietaire = connecter({ url: URL_MIGRATION ?? '', application: 'essai', production: false });
    execution = connecter({ url: URL_EXECUTION ?? '', application: 'essai', production: false });
    const dossier = new URL('../migrations/', import.meta.url);
    await migrer({
      sql: proprietaire,
      schema: 'invitations',
      roleExecution: roleDe(URL_EXECUTION ?? ''),
      migrations: readdirSync(dossier).map((nom) => ({
        nom,
        sql: readFileSync(new URL(nom, dossier), 'utf8'),
      })),
    });
  });

  afterAll(async () => {
    await Promise.all([proprietaire.end(), execution.end()]);
  });

  it('ne dépasse pas le quota face à des créations simultanées', async () => {
    const s = service(5);
    const resultats = await Promise.allSettled(
      Array.from({ length: 12 }, () => s.creer({ cohorte, par: 'sujet-gestionnaire-fictif' })),
    );
    expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect((await s.lister(cohorte)).length).toBe(5);
  });

  it('un code utilisé simultanément ne sert qu’une fois', async () => {
    const s = service(1_000);
    const { code } = await s.creer({ cohorte, par: 'sujet-gestionnaire-fictif' });
    const utilisations = await Promise.all(
      Array.from({ length: 8 }, (_, n) => s.utiliser(code, `sujet-patient-fictif-${n}`)),
    );
    expect(utilisations.filter(Boolean)).toHaveLength(1);
    expect(await s.verifier(code)).toBe(false);
  });

  it('ne stocke que l’empreinte du code, et le service ne peut rien supprimer', async () => {
    const s = service(1_000);
    const { code, id } = await s.creer({ cohorte, par: 'sujet-gestionnaire-fictif' });
    const [ligne] = await proprietaire`select * from invitations.codes where id = ${id}`;
    expect(JSON.stringify(ligne)).not.toContain(code.replace('-', ''));
    await expect(execution`delete from invitations.codes where id = ${id}`).rejects.toThrow(
      /permission/,
    );
  });
});
