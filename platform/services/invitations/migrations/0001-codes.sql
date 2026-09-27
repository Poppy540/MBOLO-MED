-- Codes d'invitation (ADR-0013). Aucune donnée de santé ni donnée identifiante :
-- empreinte HMAC du code (jamais le code), cohorte, identifiants Keycloak opaques, dates.
create table invitations.codes (
  id uuid primary key,
  empreinte bytea not null unique,
  cohorte text not null check (cohorte ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  cree_par text not null,
  cree_le timestamptz not null,
  expire_le timestamptz not null,
  utilise_le timestamptz,
  utilise_par text,
  revoque_le timestamptz,
  check (expire_le > cree_le),
  check ((utilise_le is null) = (utilise_par is null))
);
create index codes_cohorte on invitations.codes (cohorte, cree_le desc);
