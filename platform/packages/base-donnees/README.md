# `@mbolo/base-donnees`

Base des services de Mbolo Santé (ADR-0013) : PostgreSQL, **un schéma et un rôle par service**, **aucune donnée de santé** (le dossier médical reste dans le serveur FHIR).

- `connecter({ url, application, production })` : connexion avec le pilote `postgres` ; en production, TLS avec vérification du certificat (`verify-full`) quelle que soit l'adresse.
- `migrer({ sql, schema, roleExecution, migrations })` : applique les migrations manquantes (`NNNN-titre.sql`, dans l'ordre), sous verrou, avec le rôle propriétaire du schéma ; puis donne au rôle d'exécution lecture, insertion et mise à jour — **jamais la suppression**, ni l'accès à la table des migrations.
- `roleDe(url)`, `verifierIdentifiant(nom)` : les noms de schéma et de rôle sont des identifiants simples, vérifiés avant usage.
- Requêtes : uniquement par gabarits paramétrés (`sql\`… ${valeur}\``), jamais de SQL construit par concaténation. Les fichiers de migration sont versionnés et relus en revue.
- Agents IA : jamais d'accès direct à la base.

Tests d'intégration : définir `MBOLO_TEST_DATABASE_URL` (rôle de migration) et `MBOLO_TEST_DATABASE_URL_EXECUTION` (rôle d'exécution) ; toujours exécutés en CI (`scripts/postgres-test.sh`).
