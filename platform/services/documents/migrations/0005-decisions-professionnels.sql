-- Décisions de vérification des professionnels de santé (ADR-0026, étape 4), prises par une personne
-- habilitée (rôle verification-professionnels), jamais par un agent IA. Aucun nom, aucun texte
-- libre : la fiche (référence opaque), le sujet technique de la personne, le résultat, un motif codé,
-- les points contrôlés avec leur source (listes fermées) et la fin de validité retenue. Jamais
-- modifiées ni supprimées : la dernière décision fait foi, les précédentes restent comme trace.
create table documents.decisions_professionnels (
  id uuid primary key,
  practitioner_id text not null check (practitioner_id ~ '^[A-Za-z0-9.-]{1,64}$'),
  verificateur text not null check (verificateur ~ '^[A-Za-z0-9-]{1,64}$'),
  resultat text not null check (resultat in ('verifie', 'refuse', 'a-completer')),
  motif text check (motif in (
    'diplome-non-confirme', 'inscription-introuvable', 'inscription-non-valable',
    'identite-non-confirmee', 'specialite-non-confirmee', 'pieces-non-conformes')),
  controles jsonb not null check (jsonb_typeof(controles) = 'array'),
  pieces_a_refaire text[] not null default '{}',
  fin_validite date,
  decide_le timestamptz not null,
  check ((resultat = 'refuse') = (motif is not null)),
  check ((resultat = 'verifie') = (fin_validite is not null)),
  check ((resultat = 'a-completer') = (cardinality(pieces_a_refaire) > 0))
);
create index decisions_professionnel
  on documents.decisions_professionnels (practitioner_id, decide_le desc);
