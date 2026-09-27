// Base des services (ADR-0013) : PostgreSQL, un schéma et un rôle par service, migrations versionnées.
// Aucune donnée de santé ici : le dossier médical reste dans le serveur FHIR (ADR-0001).
import postgres, { type Sql } from 'postgres';

export type { Sql } from 'postgres';

const IDENTIFIANT = /^[a-z][a-z0-9_]{0,62}$/;
const NOM_MIGRATION = /^\d{4}-[a-z0-9-]+\.sql$/;

export interface Migration {
  /** Nom du fichier, ex. `0001-codes.sql` : l'ordre d'application est celui des noms. */
  nom: string;
  sql: string;
}

export class ErreurConfigurationBase extends Error {}

/**
 * Connexion d'un service à sa base. En production, TLS avec vérification du certificat est imposé,
 * quelle que soit l'adresse fournie.
 */
export function connecter(o: {
  url: string;
  /** Nom du service, visible par l'exploitant dans pg_stat_activity. */
  application: string;
  production: boolean;
  max?: number;
}): Sql {
  if (!/^postgres(ql)?:\/\//.test(o.url)) {
    throw new ErreurConfigurationBase('Adresse de base invalide (postgres://…).');
  }
  return postgres(o.url, {
    max: o.max ?? 5,
    ...(o.production ? { ssl: 'verify-full' as const } : {}),
    connection: { application_name: o.application },
    // Les avis du serveur ne sont pas journalisés tels quels (ils peuvent citer des valeurs).
    onnotice: () => undefined,
  });
}

/** Rôle (utilisateur) d'une adresse de connexion, ex. le rôle d'exécution à qui donner les droits. */
export function roleDe(url: string): string {
  return verifierIdentifiant(decodeURIComponent(new URL(url).username));
}

/** Vérifie qu'un nom de schéma ou de rôle est un identifiant simple (jamais de guillemets ni d'espace). */
export function verifierIdentifiant(nom: string): string {
  if (!IDENTIFIANT.test(nom)) {
    throw new ErreurConfigurationBase(`Identifiant SQL refusé : ${JSON.stringify(nom)}`);
  }
  return nom;
}

export function verifierMigrations(migrations: readonly Migration[]): Migration[] {
  const noms = new Set<string>();
  for (const m of migrations) {
    if (!NOM_MIGRATION.test(m.nom)) {
      throw new ErreurConfigurationBase(`Nom de migration refusé : ${m.nom} (NNNN-titre.sql).`);
    }
    if (noms.has(m.nom)) throw new ErreurConfigurationBase(`Migration en double : ${m.nom}`);
    noms.add(m.nom);
  }
  return [...migrations].sort((a, b) => a.nom.localeCompare(b.nom));
}

/**
 * Applique les migrations manquantes d'un service, avec le rôle de migration (propriétaire du schéma),
 * puis donne au rôle d'exécution la lecture, l'insertion et la mise à jour de ses tables — jamais la
 * suppression, ni la modification du schéma. Un verrou évite que deux instances migrent en même temps.
 * Retourne les migrations appliquées.
 */
export async function migrer(o: {
  sql: Sql;
  schema: string;
  roleExecution: string;
  migrations: readonly Migration[];
}): Promise<string[]> {
  const schema = verifierIdentifiant(o.schema);
  const role = verifierIdentifiant(o.roleExecution);
  const migrations = verifierMigrations(o.migrations);
  const appliquees: string[] = [];
  await o.sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${`mbolo-migrations:${schema}`}))`;
    await tx`create schema if not exists ${tx(schema)}`;
    await tx`create table if not exists ${tx(schema)}.migrations (
      nom text primary key,
      applique_le timestamptz not null default now()
    )`;
    const deja = new Set(
      (await tx<{ nom: string }[]>`select nom from ${tx(schema)}.migrations`).map((l) => l.nom),
    );
    for (const m of migrations) {
      if (deja.has(m.nom)) continue;
      // Fichier SQL versionné dans le dépôt et relu en revue : jamais une donnée reçue.
      await tx.unsafe(m.sql);
      await tx`insert into ${tx(schema)}.migrations (nom) values (${m.nom})`;
      appliquees.push(m.nom);
    }
    await tx`grant usage on schema ${tx(schema)} to ${tx(role)}`;
    await tx`grant select, insert, update on all tables in schema ${tx(schema)} to ${tx(role)}`;
    await tx`revoke delete, truncate on all tables in schema ${tx(schema)} from ${tx(role)}`;
    await tx`revoke all on ${tx(schema)}.migrations from ${tx(role)}`;
  });
  return appliquees;
}
