import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ErreurConfigurationBase,
  connecter,
  migrer,
  roleDe,
  verifierIdentifiant,
  verifierMigrations,
  type Sql,
} from './index.js';

describe('garde-fous de configuration', () => {
  it('refuse un identifiant SQL qui pourrait être une injection', () => {
    expect(verifierIdentifiant('invitations')).toBe('invitations');
    for (const nom of ['', 'Invitations', 'a b', 'x"; drop schema public; --', '1abc']) {
      expect(() => verifierIdentifiant(nom)).toThrow(ErreurConfigurationBase);
    }
  });

  it('ordonne les migrations et refuse un nom mal formé ou en double', () => {
    const m = (nom: string) => ({ nom, sql: 'select 1' });
    expect(verifierMigrations([m('0002-b.sql'), m('0001-a.sql')]).map((x) => x.nom)).toEqual([
      '0001-a.sql',
      '0002-b.sql',
    ]);
    expect(() => verifierMigrations([m('codes.sql')])).toThrow(ErreurConfigurationBase);
    expect(() => verifierMigrations([m('0001-a.sql'), m('0001-a.sql')])).toThrow(
      ErreurConfigurationBase,
    );
  });

  it("lit le rôle d'exécution dans l'adresse de connexion", () => {
    expect(roleDe('postgres://mbolo_invitations@127.0.0.1:5432/mbolo')).toBe('mbolo_invitations');
    expect(() => roleDe('postgres://Robert%22@127.0.0.1/mbolo')).toThrow(ErreurConfigurationBase);
  });

  it('refuse une adresse qui n’est pas PostgreSQL', () => {
    expect(() =>
      connecter({ url: 'mysql://x@127.0.0.1/y', application: 'essai', production: false }),
    ).toThrow(ErreurConfigurationBase);
  });
});

// Intégration : Postgres local ou de CI (données de test uniquement). Deux adresses : le rôle de
// migration (propriétaire) et le rôle d'exécution du service.
const URL_MIGRATION = process.env['MBOLO_TEST_DATABASE_URL'];
const URL_EXECUTION = process.env['MBOLO_TEST_DATABASE_URL_EXECUTION'];

describe.runIf(URL_MIGRATION && URL_EXECUTION)('migrations sur un vrai PostgreSQL', () => {
  const schema = `essai_${randomBytes(4).toString('hex')}`;
  const connexions: Sql[] = [];
  const ouvrir = (url: string): Sql => {
    const sql = connecter({ url, application: 'essai', production: false, max: 1 });
    connexions.push(sql);
    return sql;
  };
  const migrations = [
    {
      nom: '0001-table.sql',
      sql: `create table ${schema}.elements (id int primary key, valeur text not null);`,
    },
  ];

  afterAll(async () => {
    const [proprietaire] = connexions;
    if (proprietaire) await proprietaire`drop schema if exists ${proprietaire(schema)} cascade`;
    await Promise.all(connexions.map((c) => c.end()));
  });

  it("applique une migration une seule fois et limite le rôle d'exécution", async () => {
    const proprietaire = ouvrir(URL_MIGRATION ?? '');
    const roleExecution = roleDe(URL_EXECUTION ?? '');
    expect(await migrer({ sql: proprietaire, schema, roleExecution, migrations })).toEqual([
      '0001-table.sql',
    ]);
    expect(await migrer({ sql: proprietaire, schema, roleExecution, migrations })).toEqual([]);

    const service = ouvrir(URL_EXECUTION ?? '');
    await service`insert into ${service(schema)}.elements values (1, 'fictif')`;
    await service`update ${service(schema)}.elements set valeur = 'modifie' where id = 1`;
    await expect(service`delete from ${service(schema)}.elements`).rejects.toThrow(/permission/);
    await expect(service`create table ${service(schema)}.autre (x int)`).rejects.toThrow(
      /permission/,
    );
    await expect(service`select * from ${service(schema)}.migrations`).rejects.toThrow(
      /permission/,
    );
  });
});
