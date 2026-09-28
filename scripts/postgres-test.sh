#!/usr/bin/env bash
# PostgreSQL éphémère pour la CI (base des services, ADR-0013) — DONNÉES DE TEST UNIQUEMENT.
# Mots de passe et clé d'empreinte tirés au hasard, masqués dans les journaux, jamais conservés.
# Comme en production : un propriétaire des schémas (migrations) et un rôle d'exécution par service.
set -euo pipefail

if [[ -z "${GITHUB_ENV:-}" ]]; then
  echo "Réservé à la CI GitHub (GITHUB_ENV absent). En local, voir platform/services/invitations/README.md." >&2
  exit 1
fi

# Chaque valeur est masquée avant tout autre usage. Pas de sous-shell « $(…) » autour du masquage :
# la ligne ::add-mask:: serait capturée avec la valeur au lieu d'atteindre le runner.
MDP_ADMIN="$(openssl rand -hex 24)"
MDP_MIGRATION="$(openssl rand -hex 24)"
MDP_EXECUTION="$(openssl rand -hex 24)"
MDP_DOCUMENTS="$(openssl rand -hex 24)"
MDP_PAIEMENT="$(openssl rand -hex 24)"
CLE="$(openssl rand -hex 24)"
SIGNATURE_PAIEMENT="$(openssl rand -hex 32)"
for v in "$MDP_ADMIN" "$MDP_MIGRATION" "$MDP_EXECUTION" "$MDP_DOCUMENTS" "$MDP_PAIEMENT" "$CLE" "$SIGNATURE_PAIEMENT"; do
  echo "::add-mask::$v"
done

docker run -d --name mbolo-postgres-test -p 127.0.0.1:5432:5432 \
  -e POSTGRES_PASSWORD="$MDP_ADMIN" postgres:16-alpine > /dev/null
# À la première initialisation, l'image lance un serveur temporaire (socket local seulement), puis le
# redémarre : attendre la connexion TCP, que seul le serveur définitif accepte, et passer par TCP.
timeout 90 bash -c 'until docker exec mbolo-postgres-test pg_isready -h 127.0.0.1 -U postgres > /dev/null 2>&1; do sleep 1; done'

docker exec -i -e PGPASSWORD="$MDP_ADMIN" mbolo-postgres-test psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres > /dev/null <<SQL
create role mbolo_migration login password '$MDP_MIGRATION';
create role mbolo_invitations login password '$MDP_EXECUTION';
create role mbolo_documents login password '$MDP_DOCUMENTS';
create role mbolo_paiement login password '$MDP_PAIEMENT';
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
  echo "DOCUMENTS_MIGRATION_DATABASE_URL=postgres://mbolo_migration:$MDP_MIGRATION@$BASE"
  echo "DOCUMENTS_DATABASE_URL=postgres://mbolo_documents:$MDP_DOCUMENTS@$BASE"
  echo "PAIEMENT_MIGRATION_DATABASE_URL=postgres://mbolo_migration:$MDP_MIGRATION@$BASE"
  echo "PAIEMENT_DATABASE_URL=postgres://mbolo_paiement:$MDP_PAIEMENT@$BASE"
  # Signature des notifications du fournisseur de paiement simulé (ADR-0017).
  echo "MOBILE_MONEY_WEBHOOK_SIGNING_SECRET=$SIGNATURE_PAIEMENT"
} >> "$GITHUB_ENV"
echo "PostgreSQL de test prêt."
