-- Échéance d'un professionnel vérifié (ADR-0026, étape 5, décision du porteur de projet du
-- 2026-10-29) : fin de validité passée sans nouvelle vérification ; la plateforme remet la fiche
-- « à vérifier ». Ni motif, ni contrôle, ni fin de validité : une personne revérifie.
alter table documents.decisions_professionnels
  drop constraint decisions_professionnels_resultat_check,
  add constraint decisions_professionnels_resultat_check
    check (resultat in ('verifie', 'refuse', 'a-completer', 'suspendu', 'echeance')),
  add constraint decisions_professionnels_echeance_check
    check (resultat <> 'echeance' or (verificateur = 'plateforme' and cardinality(pieces_a_refaire) = 0));
