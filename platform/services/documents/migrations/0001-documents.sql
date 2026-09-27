-- Métadonnées des documents (ADR-0015). Aucune image, aucun nom : une référence opaque au patient,
-- le type, la charte acceptée, les dates et la clé du document chiffrée par la clé maître.
-- À la suppression, la clé est effacée (le contenu devient illisible pour toujours) et la ligne
-- reste comme trace ; le rôle d'exécution ne peut rien supprimer (ADR-0013).
create table documents.documents (
  id uuid primary key,
  patient_id text not null check (patient_id ~ '^[A-Za-z0-9.-]{1,64}$'),
  type text not null check (type in ('piece-identite', 'acte-naissance', 'visage')),
  format text not null check (format in ('image/jpeg', 'image/png')),
  taille integer not null check (taille > 0),
  version_charte text not null,
  cle_enveloppee bytea,
  depose_le timestamptz not null,
  supprimer_le timestamptz not null,
  supprime_le timestamptz,
  check (supprimer_le > depose_le),
  check ((supprime_le is null) = (cle_enveloppee is not null))
);
create index documents_patient on documents.documents (patient_id, depose_le desc);
create index documents_a_supprimer on documents.documents (supprimer_le) where supprime_le is null;
