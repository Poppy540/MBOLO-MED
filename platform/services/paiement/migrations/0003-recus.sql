-- Reçus et avoirs du patient (ADR-0020, flag facturation.recus). Aucune donnée de santé : libellé
-- neutre, référence opaque du rendez-vous, montant, opérateur (jamais le numéro).
-- Numérotation continue, sans trou, par série (pays et année) : le compteur et le reçu sont écrits
-- dans la même transaction ; un reçu en double est refusé (un reçu et un avoir au plus par paiement).
create table paiement.compteurs_recus (
  serie text primary key check (serie ~ '^[A-Z]{2}-[0-9]{4}$'),
  dernier bigint not null check (dernier > 0)
);

create table paiement.recus (
  numero text primary key check (numero ~ '^[A-Z]{2}-[0-9]{4}-[0-9]{6,}$'),
  type text not null check (type in ('recu', 'avoir')),
  paiement_id uuid not null references paiement.paiements (id),
  montant bigint not null check (montant > 0),
  devise text not null check (devise ~ '^[A-Z]{3}$'),
  emis_le timestamptz not null,
  unique (paiement_id, type)
);
