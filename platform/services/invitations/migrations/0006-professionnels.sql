-- Invitations des professionnels de santé (ADR-0026) : créées par l'équipe de recrutement, rattachées
-- à la fiche Practitioner du candidat, créée inactive (« à vérifier ») dans le dossier. Toujours
-- aucune donnée identifiante ici : l'empreinte du code et la référence opaque de la fiche.
alter table invitations.codes drop constraint codes_type_check;
alter table invitations.codes
  add constraint codes_type_check
    check (type in ('patient', 'proche', 'recuperation', 'professionnel')),
  add column practitioner_id text check (practitioner_id ~ '^[A-Za-z0-9.-]{1,64}$');
alter table invitations.codes
  add constraint codes_professionnel_fiche
    check ((type = 'professionnel') = (practitioner_id is not null));
create index codes_professionnels on invitations.codes (cree_le desc) where type = 'professionnel';
