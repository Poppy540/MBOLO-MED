# ADR-0013 — Base de données des services (hors dossier médical)

- **Date :** 2026-09-27
- **Statut :** acceptée (porteur de projet, 2026-09-27)
- **Décideurs :** porteur de projet

## Contexte
Jusqu'ici, tout ce qui doit durer vit dans le dossier FHIR : consentements, rendez-vous, créneaux, comptes-rendus et journal des accès. Les autres états sont en mémoire et se perdent au redémarrage.

Certaines données ne sont pas des données de santé et n'ont pas leur place dans le dossier FHIR :
- **codes d'invitation** de la vague 1 (population limitée, `docs/deploiement/vagues.md`) ;
- file d'attente et état d'envoi des notifications (reprise après échec, pas d'envoi en double) ;
- plus tard : statuts de paiement mobile money, suivi du recrutement, inscriptions à l'Académie.

Contraintes :
- **La plateforme est destinée à s'exporter** : chaque déploiement (pays) a sa propre base. Rien de propre au Gabon n'est codé en dur (préfixes, durées, quotas : paramètres).
- **Minimisation** (principe n°3) : aucune donnée de santé ; seulement des identifiants opaques (`sub` Keycloak, `Appointment/…`), jamais de nom, de téléphone ni de motif.
- **Portabilité** (ADR-0004) : un service géré standard, remplaçable (OVHcloud aujourd'hui, un hébergeur au Gabon ou ailleurs demain).
- **Moindre privilège** : un service ne voit que ses propres tables.
- Déjà dans le socle : Postgres (utilisé par Unleash, ADR-0007) et Keycloak, qui a sa propre base.

## Options envisagées
1. **PostgreSQL 16** : une base logique par déploiement, **un schéma et un rôle par service**, migrations SQL versionnées dans le dépôt.
2. **Ressources FHIR « techniques »** (`Basic`, `Task`) dans HAPI : cela mélangerait des données non médicales avec le dossier, donnerait plus de droits aux comptes de service de la passerelle et ne fournit pas les contraintes d'unicité nécessaires.
3. **Redis ou une base clé-valeur** : pas de transactions riches ni de contraintes, et une persistance à configurer avec soin. Utile plus tard comme cache, pas comme source de vérité.
4. **SQLite par service** : simple, mais incompatible avec plusieurs instances d'un service et avec une sauvegarde centralisée.

## Décision
Option 1.
- **PostgreSQL 16**, service géré de l'hébergeur retenu (ADR-0004). Chiffrement au repos, TLS obligatoire, sauvegardes quotidiennes chiffrées, restauration testée à chaque vague.
- **Un schéma et un rôle par service** (`invitations`, `notifications`…). Le rôle ne peut écrire que dans son schéma ; il ne peut ni créer de rôle ni lire les autres schémas. Identifiants `DB_USER` / `DB_PASSWORD` par service, dans le coffre-fort (ADR-0005), idéalement dynamiques.
- **Migrations SQL versionnées** (`platform/services/<service>/migrations/NNNN-titre.sql`), appliquées au démarrage par un rôle de migration distinct, jamais par le rôle d'exécution. Aucune migration destructrice sans ADR ni sauvegarde vérifiée.
- **Paquet commun `@mbolo/base-donnees`** : connexion avec TLS, requêtes paramétrées uniquement (jamais de SQL construit par concaténation), transactions, migrations. Pilote Node : **`postgres`** (porsager) — aucune dépendance transitive, requêtes paramétrées imposées par la syntaxe (installation approuvée par le porteur de projet).
- **Aucune donnée de santé ni donnée directement identifiante** : les tests automatiques vérifient que les colonnes suivent une liste autorisée par service.
- **Agents IA** : jamais d'accès direct (règle de `platform/CLAUDE.md`), uniquement des outils à portée minimale.
- **Développement et tests** : Postgres local (docker-compose, et en CI comme pour Unleash), données fictives uniquement.

### Premier usage : codes d'invitation (vague 1)
- Un code est généré par un rôle habilité (`gestion-invitations`), à usage unique. Il a une date d'expiration et peut porter une cohorte (ville, type d'utilisateur), qui sert aux feature flags (ADR-0003).
- **Seule l'empreinte du code est stockée** (HMAC-SHA-256 avec une clé du coffre-fort), jamais le code en clair. La comparaison se fait à temps constant et le nombre d'essais est limité.
- L'utilisation est atomique (`UPDATE … WHERE utilise_le IS NULL AND expire_le > now()`) : le même code ne peut pas servir deux fois, même en cas d'envois simultanés.
- L'inscription reste gérée par Keycloak : le code ne fait qu'autoriser la création du compte patient.

## Conséquences
- Nouveau paquet `@mbolo/base-donnees` et nouveaux secrets par service (inventaire `secrets/inventaire-cles.md`, section « Base de données et stockage », déjà prévue).
- La CI démarre un Postgres de test. La chaîne e2e locale réutilise le Postgres 16 déjà lancé pour Unleash, avec une base distincte.
- À mettre à jour : registre des traitements (codes d'invitation, durée de conservation), AIPD (nouvelle base, même hébergeur), plan de sauvegarde et de reprise.
- Risque : dérive vers le stockage de données de santé hors du dossier FHIR. Il est couvert par la liste autorisée de colonnes et par la revue de code.
- Décisions du porteur de projet (2026-09-27) :
  - pilote `postgres` ;
  - code valable **14 jours**, un code par personne, usage unique ; **8 caractères** sans caractères ambigus (ni 0/O, ni 1/I), faciles à dicter ou à envoyer par SMS ;
  - vague 1 : **100 patients dans une seule ville (Libreville)**, puis tranches de 100 à chaque critère de passage atteint — durée, taille et ville sont des **paramètres de déploiement**, jamais codés en dur ;
  - rôle `gestion-invitations` : le porteur de projet et **une personne de confiance nommée** (ex. coordinateur terrain), double authentification obligatoire ; **jamais un agent IA** (l'Agent 6 peut proposer une liste, un humain crée les codes) ; chaque création est journalisée.
- Reste à désigner nommément la personne de confiance.

Sources : ADR-0003, ADR-0004, ADR-0005, ADR-0007, ADR-0009 ; `docs/deploiement/vagues.md` (vague 1, population limitée) ; principes n°3, n°4 et n°5 de `CLAUDE.md` ; documentation PostgreSQL 16 (rôles et privilèges) — https://www.postgresql.org/docs/16/ddl-priv.html
