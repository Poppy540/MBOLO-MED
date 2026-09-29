-- Codes de récupération du compte d'un patient sans e-mail (ADR-0021) : remis par l'équipe
-- d'assistance, rattachés au dossier (référence opaque), valables 24 h. Toujours aucune donnée de
-- santé ni donnée identifiante : l'empreinte du code et la référence du dossier.
alter table invitations.codes drop constraint codes_type_check;
alter table invitations.codes
  add constraint codes_type_check check (type in ('patient', 'proche', 'recuperation')),
  add column patient_id text check (patient_id ~ '^[A-Za-z0-9.-]{1,64}$');
alter table invitations.codes
  add constraint codes_recuperation_dossier check ((type = 'recuperation') = (patient_id is not null));
create index codes_recuperation on invitations.codes (patient_id) where type = 'recuperation';
