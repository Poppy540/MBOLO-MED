-- Dossier de candidature des professionnels de santé (ADR-0026). Aucune image, aucun nom : la
-- référence opaque de la fiche du candidat (Practitioner), le type de pièce, la charte acceptée, les
-- dates et la clé de la pièce chiffrée par la clé maître. Comme pour les patients, à la suppression
-- la clé est effacée (contenu illisible pour toujours) et la ligne reste comme trace.
create table documents.pieces_professionnels (
  id uuid primary key,
  practitioner_id text not null check (practitioner_id ~ '^[A-Za-z0-9.-]{1,64}$'),
  type text not null
    check (type in ('diplome', 'inscription-ordre', 'piece-identite', 'assurance-rcp')),
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
create index pieces_professionnel on documents.pieces_professionnels (practitioner_id, depose_le desc);
create index pieces_a_supprimer on documents.pieces_professionnels (supprimer_le)
  where supprime_le is null;

-- Décisions du candidat sur la charte C-VERIFICATION-PRO : qui (compte), pour quelle fiche, quelle
-- version, accord ou refus, quand. Jamais modifiées : la dernière décision fait foi.
create table documents.chartes_professionnels (
  id uuid primary key,
  practitioner_id text not null check (practitioner_id ~ '^[A-Za-z0-9.-]{1,64}$'),
  sujet text not null check (sujet ~ '^[A-Za-z0-9-]{1,64}$'),
  version text not null check (version ~ '^[A-Za-z0-9.-]{1,32}$'),
  accepte boolean not null,
  decide_le timestamptz not null
);
create index chartes_professionnel on documents.chartes_professionnels (practitioner_id, decide_le desc);
