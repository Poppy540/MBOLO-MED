-- Suspension d'un professionnel vérifié (ADR-0026, étape 5, décisions du porteur de projet du
-- 2026-10-29) : même table que les décisions, résultat « suspendu » avec un motif codé (liste
-- fermée, aucun texte libre), sans contrôle ni fin de validité.
alter table documents.decisions_professionnels
  drop constraint decisions_professionnels_resultat_check,
  add constraint decisions_professionnels_resultat_check
    check (resultat in ('verifie', 'refuse', 'a-completer', 'suspendu')),
  drop constraint decisions_professionnels_motif_check,
  add constraint decisions_professionnels_motif_check check (motif in (
    'diplome-non-confirme', 'inscription-introuvable', 'inscription-non-valable',
    'identite-non-confirmee', 'specialite-non-confirmee', 'pieces-non-conformes',
    'signalement-ordre', 'plainte-confirmee', 'incident-qualite-confirme')),
  drop constraint decisions_professionnels_check,
  add constraint decisions_professionnels_motif_resultat_check
    check ((resultat in ('refuse', 'suspendu')) = (motif is not null)),
  add constraint decisions_professionnels_motif_suspension_check
    check ((resultat = 'suspendu') = (motif in (
      'signalement-ordre', 'plainte-confirmee', 'incident-qualite-confirme')));
