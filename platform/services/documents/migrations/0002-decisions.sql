-- Décisions de vérification d'identité (ADR-0015) : qui (identifiant technique du compte, jamais un
-- nom), quand, quel résultat, quel motif codé. Jamais de texte libre, jamais de numéro d'assurance.
create table documents.decisions (
  id uuid primary key,
  patient_id text not null check (patient_id ~ '^[A-Za-z0-9.-]{1,64}$'),
  verificateur text not null check (verificateur ~ '^[A-Za-z0-9.-]{1,64}$'),
  resultat text not null check (resultat in ('verifiee', 'refusee', 'a-refaire')),
  motif text check (
    motif in (
      'photo-illisible',
      'document-non-conforme',
      'visage-different',
      'document-expire',
      'autre-controle-en-personne'
    )
  ),
  decide_le timestamptz not null,
  check ((resultat = 'refusee') = (motif is not null))
);
create index decisions_patient on documents.decisions (patient_id, decide_le desc);
