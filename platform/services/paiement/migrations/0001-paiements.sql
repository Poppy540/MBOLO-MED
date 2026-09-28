-- Paiements des consultations (ADR-0017). Aucune donnée de santé ni numéro de téléphone :
-- référence opaque du rendez-vous, compte Keycloak opaque du patient, montant, statut, tentative.
create table paiement.paiements (
  id uuid primary key,
  reference text not null unique check (reference ~ '^[A-Za-z0-9.-]{1,64}$'),
  sujet text not null,
  type_consultation text not null check (type_consultation in ('generaliste', 'specialiste')),
  montant bigint not null check (montant > 0),
  devise text not null check (devise ~ '^[A-Z]{3}$'),
  statut text not null check (statut in ('a-payer', 'en-attente', 'paye', 'echoue')),
  operateur text,
  tentative uuid unique,
  fournisseur text,
  cree_le timestamptz not null,
  mis_a_jour_le timestamptz not null,
  paye_le timestamptz,
  check ((statut = 'a-payer') = (tentative is null)),
  check ((statut = 'paye') = (paye_le is not null))
);
create index paiements_en_attente on paiement.paiements (mis_a_jour_le) where statut = 'en-attente';
