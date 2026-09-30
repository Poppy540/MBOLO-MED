-- Demandes de changement du numéro après la perte du téléphone (ADR-0023). Le nouveau numéro, déjà
-- confirmé par un code, est gardé CHIFFRÉ (clé propre, enveloppée par la clé maître) jusqu'à la
-- décision d'une personne habilitée, puis effacé (numéro et clé) : il ne reste que qui, quand, quoi.
-- Jamais de texte libre ; une seule demande ouverte par patient.
create table documents.demandes_perte (
  id uuid primary key,
  patient_id text not null check (patient_id ~ '^[A-Za-z0-9.-]{1,64}$'),
  telephone_chiffre bytea,
  cle_enveloppee bytea,
  ouverte_le timestamptz not null,
  resultat text check (resultat in ('acceptee', 'refusee')),
  verificateur text check (verificateur ~ '^[A-Za-z0-9.-]{1,64}$'),
  motif text check (
    motif in (
      'photo-illisible',
      'document-non-conforme',
      'visage-different',
      'document-expire',
      'autre-controle-en-personne'
    )
  ),
  decide_le timestamptz,
  -- Ouverte : numéro chiffré présent, aucune décision. Close : numéro effacé, décision complète.
  check (
    (resultat is null and decide_le is null and verificateur is null and motif is null
      and telephone_chiffre is not null and cle_enveloppee is not null)
    or (resultat is not null and decide_le is not null and verificateur is not null
      and telephone_chiffre is null and cle_enveloppee is null
      and (resultat = 'refusee') = (motif is not null))
  )
);
create unique index demandes_perte_une_ouverte on documents.demandes_perte (patient_id)
  where resultat is null;
create index demandes_perte_ouvertes on documents.demandes_perte (ouverte_le) where resultat is null;
