#!/usr/bin/env bash
# PostgreSQL éphémère pour la CI (base des services, ADR-0013) — DONNÉES DE TEST UNIQUEMENT.
# Mots de passe et clé d'empreinte tirés au hasard, masqués dans les journaux, jamais conservés.
# Deux rôles, comme en production : propriétaire du schéma (migrations) et rôle d'exécution du service.
set -euo pipefail

if [[ -z "${GITHUB_ENV:-}" ]]; then
  echo "Réservé à la CI GitHub (GITHUB_ENV absent). En local, voir platform/services/invitations/README.md." >&2
  exit 1
fi

secret() {
  local v
  v="$(openssl rand -hex 24)"
  echo "::add-mask::$v"
  echo "$v"
}
MDP_ADMIN="$(secret)"
MDP_MIGRATION="$(secret)"
MDP_EXECUTION="$(secret)"
CLE="$(secret)"

docker run -d --name mbolo-postgres-test -p 127.0.0.1:5432:5432 \
  -e POSTGRES_PASSWORD="$MDP_ADMIN" postgres:16-alpine > /dev/null
timeout 60 bash -c 'until docker exec mbolo-postgres-test pg_isready -U postgres > /dev/null 2>&1; do sleep 1; done'
# pg_isready répond pendant l'initialisation : on attend une vraie requête.
timeout 60 bash -c 'until docker exec mbolo-postgres-test psql -U postgres -tc "select 1" > /dev/null 2>&1; do sleep 1; done'

docker exec -i mbolo-postgres-test psql -v ON_ERROR_STOP=1 -U postgres > /dev/null <<SQL
create role mbolo_migration login password '$MDP_MIGRATION';
create role mbolo_invitations login password '$MDP_EXECUTION';
create database mbolo owner mbolo_migration;
\c mbolo
revoke create on schema public from public;
SQL

BASE="127.0.0.1:5432/mbolo"
{
  echo "MBOLO_TEST_DATABASE_URL=postgres://mbolo_migration:$MDP_MIGRATION@$BASE"
  echo "MBOLO_TEST_DATABASE_URL_EXECUTION=postgres://mbolo_invitations:$MDP_EXECUTION@$BASE"
  echo "INVITATIONS_MIGRATION_DATABASE_URL=postgres://mbolo_migration:$MDP_MIGRATION@$BASE"
  echo "INVITATIONS_DATABASE_URL=postgres://mbolo_invitations:$MDP_EXECUTION@$BASE"
  echo "INVITATIONS_CLE_EMPREINTE=$CLE"
} >> "$GITHUB_ENV"
echo "PostgreSQL de test prêt."
