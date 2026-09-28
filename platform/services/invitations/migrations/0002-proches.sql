-- Invitations de proches par le patient (ADR-0019). Toujours aucune donnée de santé ni donnée
-- identifiante : le type du code, et la référence opaque de la fiche du proche dans le dossier.
-- Le numéro qui reçoit le code n'est jamais enregistré.
alter table invitations.codes
  add column type text not null default 'patient' check (type in ('patient', 'proche')),
  add column related_person_id text check (related_person_id ~ '^[A-Za-z0-9.-]{1,64}$');
alter table invitations.codes
  add constraint codes_proche_fiche check ((type = 'proche') = (related_person_id is not null));
create index codes_createur on invitations.codes (cree_par, type, cree_le desc);
