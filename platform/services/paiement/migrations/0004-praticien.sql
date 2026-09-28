-- Relevés des intervenants (ADR-0020) : chaque paiement retient la référence opaque du professionnel
-- du rendez-vous (identifiant FHIR du Practitioner), jamais son nom ni sa spécialité. Les paiements
-- déjà enregistrés n'en ont pas : ils restent hors relevé.
alter table paiement.paiements
  add column praticien text check (praticien ~ '^[A-Za-z0-9.-]{1,64}$');
create index paiements_praticien_paye on paiement.paiements (praticien, paye_le) where statut = 'paye';
