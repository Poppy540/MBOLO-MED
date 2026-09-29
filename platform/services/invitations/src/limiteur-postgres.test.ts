// Compteurs d'essais partagés (revue ASVS n°1, D3) sur un vrai PostgreSQL (local ou CI, données de
// test uniquement) : migration réelle, rôle d'exécution restreint, essais simultanés.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connecter, migrer, roleDe, type Sql } from '@mbolo/base-donnees';
import { creerEmpreinte } from './codes.js';
import { LimiteurPostgres } from './limiteur.js';

const URL_MIGRATION = process.env['MBOLO_TEST_DATABASE_URL'];
const URL_EXECUTION = process.env['MBOLO_TEST_DATABASE_URL_EXECUTION'];

describe.runIf(URL_MIGRATION && URL_EXECUTION)('limiteur PostgreSQL des invitations', () => {
  let proprietaire: Sql;
  let execution: Sql;
  const empreinte = creerEmpreinte('essai-'.repeat(8));
  // Clé propre à chaque exécution : les compteurs des exécutions précédentes ne gênent pas.
  const cle = () => `203.0.113.${Math.floor(Math.random() * 250)}-${randomUUID()}`;
  const limiteur = (sql: Sql, maximum = 5) =>
    new LimiteurPostgres(sql, {
      portee: 'verification-code',
      maximum,
      fenetreMs: 60_000,
      empreinte,
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

  it('ne laisse passer que le maximum, même depuis deux instances en même temps', async () => {
    // Deux connexions distinctes jouent deux instances du service.
    const autre = connecter({ url: URL_EXECUTION ?? '', application: 'essai', production: false });
    try {
      const [a, b] = [limiteur(execution), limiteur(autre)];
      const k = cle();
      const maintenant = Date.now();
      const resultats = await Promise.all(
        Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).essayer(k, maintenant)),
      );
      expect(resultats.filter(Boolean)).toHaveLength(5);
    } finally {
      await autre.end();
    }
  });

  it('rouvre après la fenêtre, et compte chaque clé à part', async () => {
    const l = limiteur(execution, 2);
    const [k, autre] = [cle(), cle()];
    const t0 = Date.now();
    expect(await l.essayer(k, t0)).toBe(true);
    expect(await l.essayer(k, t0 + 10)).toBe(true);
    expect(await l.essayer(k, t0 + 20)).toBe(false);
    expect(await l.essayer(autre, t0 + 20)).toBe(true);
    expect(await l.essayer(k, t0 + 60_000)).toBe(true);
    expect(await l.essayer(k, t0 + 60_010)).toBe(true);
    expect(await l.essayer(k, t0 + 60_020)).toBe(false);
  });

  it('ne garde jamais la clé en clair, seulement son empreinte', async () => {
    const k = cle();
    await limiteur(execution).essayer(k);
    const lignes = await proprietaire<{ cle: Buffer }[]>`
      select cle from invitations.essais where cle = ${empreinte(`verification-code:${k}`)}`;
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.cle.toString('utf8')).not.toContain('203.0.113');
  });
});
