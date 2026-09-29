// Intégration sur un vrai PostgreSQL (local ou CI, données de test uniquement) : migration réelle,
// rôle d'exécution restreint, quota et usage unique atomiques face à des requêtes simultanées.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connecter, migrer, roleDe, type Sql } from '@mbolo/base-donnees';
import { creerEmpreinte } from './codes.js';
import { COHORTE_PROCHES, COHORTE_RECUPERATION, DepotPostgres } from './depot.js';
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

  it('ne dépasse pas 3 proches par patient face à des invitations simultanées (ADR-0019)', async () => {
    const depot = new DepotPostgres(execution);
    const patient = `sujet-patient-fictif-${randomUUID().slice(0, 8)}`;
    const maintenant = new Date();
    const resultats = await Promise.all(
      Array.from({ length: 8 }, (_, n) =>
        depot.creerPourProche(
          {
            id: randomUUID(),
            empreinte: empreinte(`PROCHE${n}${randomUUID().slice(0, 4)}`),
            cohorte: COHORTE_PROCHES,
            type: 'proche',
            relatedPersonId: `rp-fictif-${n}`,
            creePar: patient,
            creeLe: maintenant,
            expireLe: new Date(maintenant.getTime() + 7 * 86_400_000),
          },
          3,
          maintenant,
          { max: 100, depuis: new Date(maintenant.getTime() - 86_400_000) },
        ),
      ),
    );
    expect(resultats.filter((r) => r === 'cree')).toHaveLength(3);
    const liste = await depot.listerProches(patient);
    expect(liste.map((i) => i.type)).toEqual(['proche', 'proche', 'proche']);
    // La fiche du proche est obligatoire pour un code de proche (contrainte de la table).
    await expect(
      execution`insert into invitations.codes (id, empreinte, cohorte, type, cree_par, cree_le, expire_le)
                values (${randomUUID()}, ${empreinte('SANSFICHE')}, ${COHORTE_PROCHES}, 'proche',
                        ${patient}, ${maintenant}, ${new Date(maintenant.getTime() + 1000)})`,
    ).rejects.toThrow(/codes_proche_fiche/);
  });

  it('ne dépasse pas la limite d’invitations par jour, même simultanées (ADR-0019)', async () => {
    const depot = new DepotPostgres(execution);
    const patient = `sujet-patient-fictif-${randomUUID().slice(0, 8)}`;
    const maintenant = new Date();
    const resultats = await Promise.all(
      Array.from({ length: 6 }, (_, n) =>
        depot.creerPourProche(
          {
            id: randomUUID(),
            empreinte: empreinte(`JOUR${n}${randomUUID().slice(0, 4)}`),
            cohorte: COHORTE_PROCHES,
            type: 'proche',
            relatedPersonId: `rp-fictif-j${n}`,
            creePar: patient,
            creeLe: maintenant,
            expireLe: new Date(maintenant.getTime() + 7 * 86_400_000),
          },
          10,
          maintenant,
          { max: 2, depuis: new Date(maintenant.getTime() - 86_400_000) },
        ),
      ),
    );
    expect(resultats.filter((r) => r === 'cree')).toHaveLength(2);
    expect(resultats.filter((r) => r === 'limite-jour')).toHaveLength(4);
  });

  it('retrouve et révoque l’invitation par la fiche du proche (retrait par l’équipe)', async () => {
    const depot = new DepotPostgres(execution);
    const patient = `sujet-patient-fictif-${randomUUID().slice(0, 8)}`;
    const fiche = `rp-fictif-${randomUUID().slice(0, 8)}`;
    const maintenant = new Date();
    const id = randomUUID();
    await depot.creerPourProche(
      {
        id,
        empreinte: empreinte(`FICHE${randomUUID().slice(0, 4)}`),
        cohorte: COHORTE_PROCHES,
        type: 'proche',
        relatedPersonId: fiche,
        creePar: patient,
        creeLe: maintenant,
        expireLe: new Date(maintenant.getTime() + 7 * 86_400_000),
      },
      3,
      maintenant,
      { max: 100, depuis: new Date(maintenant.getTime() - 86_400_000) },
    );
    expect((await depot.parFiche(fiche))?.id).toBe(id);
    expect(await depot.revoquerParFiche(fiche, maintenant)).toBe(true);
    expect((await depot.parFiche(fiche))?.revoqueLe).toBeDefined();
    expect(await depot.revoquerParFiche(fiche, maintenant)).toBe(false);
    expect(await depot.parFiche('rp-fictif-inconnu')).toBeUndefined();
  });

  it('un seul code de récupération valable par dossier, même créés simultanément (ADR-0021)', async () => {
    const depot = new DepotPostgres(execution);
    const dossier = `pat-fictif-${randomUUID().slice(0, 8)}`;
    const maintenant = new Date();
    const codes = Array.from({ length: 5 }, (_, n) => ({
      id: randomUUID(),
      empreinte: empreinte(`RECUP${n}${randomUUID().slice(0, 4)}`),
      cohorte: COHORTE_RECUPERATION,
      type: 'recuperation' as const,
      patientId: dossier,
      creePar: 'sujet-assistant-fictif',
      creeLe: maintenant,
      expireLe: new Date(maintenant.getTime() + 24 * 3_600_000),
    }));
    const resultats = await Promise.all(codes.map((c) => depot.creerRecuperation(c, maintenant)));
    expect(resultats).toEqual(Array(5).fill('cree'));
    const [valables] = await proprietaire<{ n: number }[]>`
      select count(*)::int as n from invitations.codes
       where patient_id = ${dossier} and revoque_le is null`;
    expect(valables?.n).toBe(1);
    const trouve = await depot.trouver(codes[0]?.empreinte ?? Buffer.alloc(0));
    expect(trouve).toMatchObject({ type: 'recuperation', patientId: dossier });
    // Le dossier est obligatoire pour un code de récupération (contrainte de la table).
    await expect(
      execution`insert into invitations.codes (id, empreinte, cohorte, type, cree_par, cree_le, expire_le)
                values (${randomUUID()}, ${empreinte('SANSDOSSIER')}, ${COHORTE_RECUPERATION},
                        'recuperation', 'sujet-assistant-fictif', ${maintenant},
                        ${new Date(maintenant.getTime() + 1000)})`,
    ).rejects.toThrow(/codes_recuperation_dossier/);
  });
});
