-- Compteurs d'essais partagés entre les instances (revue ASVS n°1, D3) : vérification des codes
-- d'invitation et contrôle de la date de naissance par l'assistance. Aucune donnée identifiante :
-- la clé (adresse du navigateur, sujet et dossier) n'est gardée que sous forme d'empreinte HMAC.
-- Le rôle d'exécution ne supprime jamais : une ligne est réutilisée quand sa fenêtre est passée.
create table invitations.essais (
  portee text not null check (portee ~ '^[a-z][a-z-]{0,31}$'),
  cle bytea not null,
  debut timestamptz not null,
  nombre integer not null check (nombre >= 1),
  primary key (portee, cle)
);
