-- Retrait des proches par l'équipe d'assistance (ADR-0019) : les invitations sont retrouvées par la
-- fiche du proche dans le dossier (référence opaque), sans connaître le compte du patient.
create index codes_fiche_proche on invitations.codes (related_person_id, cree_le desc)
  where type = 'proche';
