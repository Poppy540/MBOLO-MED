// Dossier de candidature sur un vrai PostgreSQL (ADR-0026) : migration réelle, rôle d'exécution
// restreint, limite par type sous verrou. Données de test uniquement ; exécuté si les variables
// MBOLO_TEST_DATABASE_URL* sont définies (toujours en CI).
import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connecter, migrer, roleDe, type Sql } from '@mbolo/base-donnees';
import { DepotCandidaturesPostgres, type Piece } from './candidature.js';

const URL_MIGRATION = process.env['MBOLO_TEST_DATABASE_URL'];
const URL_EXECUTION = process.env['MBOLO_TEST_DATABASE_URL_EXECUTION'];

describe.runIf(URL_MIGRATION && URL_EXECUTION)('pièces des professionnels sur PostgreSQL', () => {
  let proprietaire: Sql;
  let execution: Sql;
  // Fiche propre à cette exécution : les données des exécutions précédentes ne gênent pas.
  const practitionerId = `prac-candidat-${randomUUID().slice(0, 8)}`;
  const maintenant = new Date('2026-10-28T08:00:00Z');
  const piece = (type: Piece['type'] = 'diplome'): Piece => ({
    id: randomUUID(),
    practitionerId,
    type,
    format: 'image/jpeg',
    taille: 500,
    versionCharte: 'c-verification-pro-v0.1',
    cleEnveloppee: randomBytes(60),
    deposeLe: maintenant,
    supprimerLe: new Date(maintenant.getTime() + 730 * 86_400_000),
  });

  beforeAll(async () => {
    proprietaire = connecter({ url: URL_MIGRATION ?? '', application: 'essai', production: false });
    execution = connecter({ url: URL_EXECUTION ?? '', application: 'essai', production: false });
    const dossier = new URL('../migrations/', import.meta.url);
    await migrer({
      sql: proprietaire,
      schema: 'documents',
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

  it('ne dépasse pas la limite par type face à des dépôts simultanés', async () => {
    const depot = new DepotCandidaturesPostgres(execution);
    const resultats = await Promise.all(
      Array.from({ length: 6 }, () => depot.insererPieceSiPlace(piece('diplome'), 2)),
    );
    expect(resultats.filter(Boolean)).toHaveLength(2);
    expect(await depot.insererPieceSiPlace(piece('inscription-ordre'), 2)).toBe(true);
    const presentes = await depot.piecesDe(practitionerId);
    expect(presentes.map((p) => p.type).sort()).toEqual([
      'diplome',
      'diplome',
      'inscription-ordre',
    ]);
  });

  it('la dernière décision sur la charte fait foi', async () => {
    const depot = new DepotCandidaturesPostgres(execution);
    const decision = (accepte: boolean, minutes: number) => ({
      id: randomUUID(),
      practitionerId,
      sujet: 'u-candidat-fictif',
      version: 'c-verification-pro-v0.1',
      accepte,
      decideLe: new Date(maintenant.getTime() + minutes * 60_000),
    });
    await depot.enregistrerCharte(decision(true, 1));
    await depot.enregistrerCharte(decision(false, 2));
    expect(await depot.derniereCharte(practitionerId)).toMatchObject({ accepte: false });
  });

  it('rotation et suppression : clé remplacée sous condition, puis détruite ; rien n’est supprimé', async () => {
    const depot = new DepotCandidaturesPostgres(execution);
    const p = piece('assurance-rcp');
    await depot.insererPieceSiPlace(p, 2);
    const nouvelle = randomBytes(60);
    // Une ancienne clé qui ne correspond plus n'écrase rien.
    expect(await depot.remplacerCle(p.id, randomBytes(60), nouvelle)).toBe(false);
    expect(await depot.remplacerCle(p.id, p.cleEnveloppee ?? Buffer.alloc(0), nouvelle)).toBe(true);
    const echues = await depot.piecesEchues(new Date('2029-01-01T00:00:00Z'), 100);
    expect(echues.map((x) => x.id)).toContain(p.id);
    expect(await depot.detruireClePiece(p.id, new Date('2029-01-01T00:00:00Z'))).toBe(true);
    expect((await depot.piecesDe(practitionerId)).map((x) => x.id)).not.toContain(p.id);
    // Le rôle d'exécution ne peut rien supprimer (ADR-0013) : la ligne reste comme trace.
    await expect(
      execution`delete from documents.pieces_professionnels where id = ${p.id}`,
    ).rejects.toThrow();
  });
});
