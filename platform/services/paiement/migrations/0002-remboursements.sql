-- Rendez-vous annulé et remboursements (ADR-0017). Un remboursement est préparé par la plateforme
-- quand un paiement est reçu pour un rendez-vous annulé ; il n'est exécuté qu'après la décision d'un
-- humain (rôle validation-remboursement). Aucune donnée de santé, aucun numéro, aucun texte libre.
alter table paiement.paiements add column annule_le timestamptz;

create table paiement.remboursements (
  id uuid primary key,
  paiement_id uuid not null unique references paiement.paiements (id),
  montant bigint not null check (montant > 0),
  devise text not null check (devise ~ '^[A-Z]{3}$'),
  statut text not null check (statut in ('a-valider', 'valide', 'refuse', 'effectue')),
  prepare_le timestamptz not null,
  decide_par text,
  decide_le timestamptz,
  effectue_le timestamptz,
  check ((statut = 'a-valider') = (decide_par is null)),
  check ((statut = 'a-valider') = (decide_le is null)),
  check ((statut = 'effectue') = (effectue_le is not null))
);
create index remboursements_statut on paiement.remboursements (statut, prepare_le);
