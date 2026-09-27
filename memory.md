# Mémoire du projet — Mbolo Santé

> Lue à chaque session. **Moins de 200 lignes. Aucun secret, aucune donnée personnelle.** Les détails vont dans `docs/`.
> Dernière mise à jour : 2026-09-27.

## 1. État actuel

- **Vague en cours : 0 (fondations).** Aucun patient réel, aucune donnée réelle.
- **Fait :**
  - Étape 2 — sécurité : `.gitignore`, pre-commit + gitleaks, `.claude/settings.json`, `secrets/` (inventaire sans valeurs, 17 modèles `CHANGEME` dont `identite`).
  - Étape 3 — référence : `CLAUDE.md`, `memory.md`, `README.md`, `docs/deploiement/vagues.md`, squelettes de `docs/`.
  - Étape 4 — agents 1 à 5 : `CLAUDE.md`, `system-prompt.md`, `permissions.md`, 45 skills + `garde-fous-communs` (`agents/_commun/`), cas de test (option C).
  - Étape 5 — salle de contrôle : 7 sous-agents (`.claude/agents/`), 42 skills (`.claude/skills/`, dont 20 complets), modèles de fiche, brief, rapport, revue, décision ; registre des risques initial (12 risques).
  - Étape 6 — squelette `platform/` (apps, services, tests) + `platform/CLAUDE.md` ; aucun code applicatif.
  - Étape 7 — contrôle final : gitleaks (fichiers + historique) sans fuite ; hooks pre-commit au vert ; aucune clé Claude, aucun téléphone ou e-mail réel ; 88 skills conformes (frontmatter, exemples fictifs, limites, sources) ; principes repris mot pour mot.
- **Bilan des skills :** 88 (46 plateforme dont `garde-fous-communs`, 42 salle de contrôle) — 24 `complet`, 64 `v1`. Chaque agent a des cas de refus ou d'escalade.
- **Dépôt :** fondations fusionnées dans `main` via [PR n°1](https://github.com/Poppy540/MBOLO-MED/pull/1) ; `main` protégée (pull request obligatoire, force-push et suppression interdits).
- **Développement vague 0 (petites PR) :** A outillage — fusionnée ([PR n°2](https://github.com/Poppy540/MBOLO-MED/pull/2)) ; B `dossier-fhir` — fusionnée ([PR n°3](https://github.com/Poppy540/MBOLO-MED/pull/3)) ; C `identite` — fusionnée ([PR n°4](https://github.com/Poppy540/MBOLO-MED/pull/4)) ; D premiers e2e — fusionnée ([PR n°5](https://github.com/Poppy540/MBOLO-MED/pull/5)).
- **Durcissement identité :** PR E fusionnée ([PR n°6](https://github.com/Poppy540/MBOLO-MED/pull/6)) — MFA OTP obligatoire pour les rôles professionnels, jeton sans e-mail ni nom, profil intégré au royaume.
- **PR F fusionnée** ([PR n°7](https://github.com/Poppy540/MBOLO-MED/pull/7)) : consentements stockés dans HAPI FHIR (`DepotFhir`, recherche sans cache, verrou optimiste).
- **PR G fusionnée** ([PR n°8](https://github.com/Poppy540/MBOLO-MED/pull/8)) : passerelle du dossier `passerelle-fhir` (ADR-0010, proposée), jetons de service, permissions SMART (`mbolo_scopes`).
- **PR H fusionnée** ([PR n°9](https://github.com/Poppy540/MBOLO-MED/pull/9)) : feature flags `@mbolo/drapeaux` (OpenFeature + Unleash 7), registre `docs/deploiement/flags.md`, flag `consentement.proche`.
- **PR I fusionnée** ([PR n°10](https://github.com/Poppy540/MBOLO-MED/pull/10)) : journal des accès (`AuditEvent`, aucun accès sans trace, traces immuables, historique visible par le patient).
- **PR J fusionnée** ([PR n°11](https://github.com/Poppy540/MBOLO-MED/pull/11)) : revue humaine des bris de glace (rôle `revue-acces`, retards, conclusion tracée, pas d'auto-revue) ; 34 scénarios e2e.
- **Vague 1 — téléconsultation :** LiveKit retenu (ADR-0011, décision du porteur de projet du 2026-09-27). **Prototype fusionné (PR K, [PR n°12](https://github.com/Poppy540/MBOLO-MED/pull/12))** : service `teleconsultation` (jeton de salle réservé aux 2 participants, flag `teleconsultation.video`), appel réel entre deux navigateurs en e2e. **PR L fusionnée** ([PR n°13](https://github.com/Poppy540/MBOLO-MED/pull/13)) : rendez-vous dans le dossier (`Appointment`, profil `mbolo-rendez-vous` sans motif, compte de service `system/Appointment.crus`). **PR M + N fusionnées** ([PR n°14](https://github.com/Poppy540/MBOLO-MED/pull/14)) : annulation (qui et quand, sans motif, salle fermée) ; créneaux (`Schedule`/`Slot`, publiés par le professionnel, réservés par le patient avec verrou, libérés à l'annulation). **PR O fusionnée** ([PR n°15](https://github.com/Poppy540/MBOLO-MED/pull/15)) : report, retrait d'un créneau libre. **PR P fusionnée** ([PR n°16](https://github.com/Poppy540/MBOLO-MED/pull/16)) : service `notifications` (ADR-0012 proposée : gabarits fermés, C-RAPPELS, numéro lu dans le dossier, canal simulé). **PR Q fusionnée** ([PR n°17](https://github.com/Poppy540/MBOLO-MED/pull/17)) : minimisation par élément (`mbolo_elements`). **PR R fusionnée** ([PR n°18](https://github.com/Poppy540/MBOLO-MED/pull/18)) : application patient (Preact + Vite, 9,9 Ko à l'ouverture, PKCE, créneaux, visio avec repli audio). **PR S fusionnée** ([PR n°19](https://github.com/Poppy540/MBOLO-MED/pull/19)) : notifications paramétrables par pays. **PR T fusionnée** ([PR n°20](https://github.com/Poppy540/MBOLO-MED/pull/20)) : espace professionnel et paquet commun `@mbolo/client-web` ; applications sur 5180 et 5181 (5173 et 5174 réservés aux tests). **PR U fusionnée** ([PR n°21](https://github.com/Poppy540/MBOLO-MED/pull/21)) : hors ligne. **PR V fusionnée** ([PR n°22](https://github.com/Poppy540/MBOLO-MED/pull/22)) : consultation clinique (dossier après décision d'`identite`, compte-rendu signé par le professionnel, jamais par une IA). **PR W fusionnée** ([PR n°23](https://github.com/Poppy540/MBOLO-MED/pull/23)) : annuaire des médecins. **PR X fusionnée** ([PR n°24](https://github.com/Poppy540/MBOLO-MED/pull/24)) : scans de sécurité (CodeQL, `pnpm audit`, revue des dépendances ; graphe des dépendances activé par le porteur de projet). **PR Y fusionnée** ([PR n°25](https://github.com/Poppy540/MBOLO-MED/pull/25)) : ADR-0013 proposée ; son acceptation (décisions du 2026-09-27) arrive avec la PR Z. **PR Z fusionnée** ([PR n°26](https://github.com/Poppy540/MBOLO-MED/pull/26)) : `@mbolo/base-donnees` (pilote `postgres`, migrations, rôle d'exécution sans suppression) et service `invitations` (codes à usage unique, empreinte HMAC, quota par cohorte sous verrou, vérification limitée, rôle `gestion-invitations`) ; Postgres éphémère en CI (`scripts/postgres-test.sh`) ; 63 scénarios e2e. **PR AA fusionnée** ([PR n°27](https://github.com/Poppy540/MBOLO-MED/pull/27)) : ADR-0014 acceptée (extension Keycloak, code remis par téléphone au patient ou à son aidant, identité vérifiée dès la vague 1 : CNAMGS + pièce d'identité, ou numéro provisoire créé par un professionnel avec l'acte de naissance). **PR AB en cours** : extension Keycloak d'inscription (Java, `keycloak-extension/`, Keycloak épinglé 26.7.4 (26.0.x avait des failles hautes connues) ; code contrôlé puis utilisé à la création du compte, rôle `patient` seul, formulaire sans nom ni e-mail, jeton de service signé par le royaume) ; bouton « J'ai un code d'invitation » dans l'application patient ; 68 scénarios e2e. **Ensuite** : saisie de l'identité dans le dossier (profil `mbolo-patient`), puis vérification (photos, charte, rôle `verification-identite`).
- **Protection de `main` à vérifier** : les PR E, F et H ont été fusionnées avant la fin de la CI (contrôles obligatoires non appliqués ou contournés par l'administrateur).
- **Réseau de l'environnement Claude Code :** `packages.fhir.org`, `hl7.org`, `build.fhir.org`, `quay.io` bloqués → validation FHIR officielle uniquement en CI GitHub ; Keycloak lancé localement depuis l'archive des versions GitHub, HAPI depuis la couche de l'image Docker Hub (`app/main.war`, Java 21) ; Unleash 7 et base `mbolo` (rôles `mbolo_migration`, `mbolo_invitations`) sur un Postgres 16 local (port 5433) ; LiveKit 1.12.0 (binaire GitHub, empreinte vérifiée en CI) ; pas de démon Docker ; script de relance dans le dossier de travail.
- **Avis juridique :** annoncé comme validé par le porteur de projet (2026-09-26) ; conclusions détaillées à consigner (D-0003) avant de lever la réserve de l'ADR-0004.

## 2. Décisions validées

| Date | Décision | Référence |
|---|---|---|
| 2026-09-26 | Téléconsultation Gabon d'abord, professionnels du monde entier ; besoin considéré comme validé | [D-0001](control-room/decisions/0001-decisions-initiales.md) |
| 2026-09-26 | Plateforme construite complète, activée par vagues et feature flags (ville, spécialité, type d'utilisateur) | D-0001, [vagues](docs/deploiement/vagues.md) |
| 2026-09-26 | Modèle hybride : smartphone + points de consultation assistée (infirmier + objets connectés) | D-0001 |
| 2026-09-26 | Équipe pluridisciplinaire ; pharmacies locales (ordonnances électroniques, génériques) ; Académie Mbolo | D-0001 |
| 2026-09-26 | Conception pour faible débit par défaut, repli audio, hors ligne ; vocal et pictogrammes ; français puis langues locales | D-0001 |
| 2026-09-26 | Paiement : mobile money (Airtel, Moov) localement, carte pour la diaspora | D-0001 |
| 2026-09-26 | Complément d'eGabon-SIS, jamais concurrent ; interopérabilité prévue | D-0001 |
| 2026-09-26 | Convention CNAMGS visée en vague 4 | D-0001 |
| 2026-09-26 | Hypothèses économiques : MG 10 000 FCFA, spécialisée 15 000 FCFA, Diaspora Famille 25 €/mois, pharmacie 50 000 FCFA/mois, 55 % reversés au professionnel ; rentabilité année 3 ; le tableur fait foi | D-0001, [business plan](docs/business-plan/README.md) |
| 2026-09-26 | Dossier médical HL7 FHIR, serveur open source (ex. HAPI FHIR) | [ADR-0001](docs/architecture/adr/0001-fhir.md) |
| 2026-09-26 | Vidéo WebRTC adaptée au faible débit (ex. LiveKit ou Jitsi) | [ADR-0002](docs/architecture/adr/0002-webrtc-faible-debit.md) |
| 2026-09-26 | Déploiement progressif par feature flags | [ADR-0003](docs/architecture/adr/0003-feature-flags.md) |
| 2026-09-26 | Tests automatisés Gherkin + Playwright | D-0001 |
| 2026-09-26 | Six agents IA, aucun ne pose de diagnostic ni ne prescrit ; Agent 6 démarre aux niveaux d'autonomie 1 à 3 | D-0001 |
| 2026-09-26 | Secrets : inventaire sans valeurs dans `secrets/`, valeurs dans un coffre-fort ; clé API Claude exclue de l'inventaire | D-0001 |
| 2026-09-26 | Cas de test « option C » : 3 cas pour skills vague 0 et cliniques, 1 cas pour les skills V1 ; 3 cas obligatoires avant activation | D-0001 |
| 2026-09-26 | Skills ajoutés : `garde-fous-communs`, `interoperabilite-egabon-sis`, `pseudonymisation-donnees`, `coordination-interpretes` | D-0001 |
| 2026-09-26 | Nom d'usage « Mbolo Santé » (dépôt `MBOLO-MED`) | D-0001 |
| 2026-09-26 | Hébergement : OVHcloud HDS (France), **sous réserve de l'avis juridique** sur la localisation au Gabon | [D-0002](control-room/decisions/0002-choix-outils-infrastructure.md), [ADR-0004](docs/architecture/adr/0004-hebergement-donnees-sante.md) |
| 2026-09-26 | Coffre-fort : Infisical (UE, puis auto-hébergé) | D-0002, [ADR-0005](docs/architecture/adr/0005-coffre-fort-secrets.md) |
| 2026-09-26 | Messagerie salle de contrôle : Slack + astreinte Grafana OnCall (appel / SMS) | D-0002, [ADR-0006](docs/architecture/adr/0006-messagerie-salle-de-controle.md) |
| 2026-09-26 | Feature flags : Unleash via OpenFeature | D-0002, [ADR-0007](docs/architecture/adr/0007-feature-flags-unleash.md) |
| 2026-09-26 | Socle : monorepo TypeScript (Node 22, pnpm), CI GitHub Actions ; identité via Keycloak (ADR à venir) | [ADR-0008](docs/architecture/adr/0008-socle-technique.md) |
| 2026-09-27 | **Gabon = premier pays test ; la plateforme a vocation à s'exporter** : tout ce qui dépend du pays (fuseau, langue, formats, indicatif, cadre légal, hébergement) est paramétrable, jamais codé en dur. Gabarits de notification paramétrables depuis la PR S ; restent : numéros d'exemple, langue choisie par patient | Porteur de projet |
| 2026-09-27 | Base des services : PostgreSQL 16, un schéma et un rôle par service, pilote `postgres`, aucune donnée de santé ; invitations : code de 8 caractères valable 14 jours, usage unique, 100 patients à Libreville en vague 1 (paramétrable), rôle `gestion-invitations` humain avec MFA, jamais une IA | [ADR-0013](docs/architecture/adr/0013-base-de-donnees-services.md) |
| 2026-09-27 | Inscription par extension Keycloak (mot de passe jamais hors de Keycloak) ; code remis par téléphone au patient ou à son aidant ; identité vérifiée dès la vague 1 (CNAMGS + pièce d'identité, ou numéro provisoire via un professionnel et l'acte de naissance) ; photos du document et du visage, vérifiées à distance par le rôle `verification-identite` (MFA), conservées comme preuve après acceptation d'une charte (sous réserve de l'avis juridique) ; données : nom, prénom, date de naissance, sexe facultatif, téléphone | [ADR-0014](docs/architecture/adr/0014-inscription-patient.md) |
| 2026-09-27 | Dependabot (npm, Maven, docker-compose, actions) et délais de correction des failles : critique 48 h, haute 7 j, modérée 30 j | [scans](docs/securite/scans.md) |
| 2026-09-27 | Téléconsultation vidéo : LiveKit (Jitsi en repli), sous réserve d'un prototype et d'un test terrain ; aucun enregistrement par défaut | [ADR-0011](docs/architecture/adr/0011-serveur-webrtc.md) |
| 2026-09-27 | Identité Keycloak ; refus par défaut ; accès au dossier sur consentement FHIR révocable ; bris de glace avec motif et revue humaine (proposée, PR C) | [ADR-0009](docs/architecture/adr/0009-identite-controle-acces.md) |

## 3. Hypothèses en attente de confirmation

- **Cadre légal** de la téléconsultation au Gabon, notamment par un médecin inscrit à l'étranger (inscription à l'Ordre des médecins du Gabon requise ? autorisation ministérielle ?).
- **Standard d'eGabon-SIS** (FHIR ? DHIS2 ? OpenMRS ?) et conditions d'interopérabilité.
- **Validité des ordonnances** électroniques et des ordonnances signées par un médecin étranger en pharmacie gabonaise.
- **Hébergement des données de santé** : obligation de localisation au Gabon ? Certification exigée ? (équivalent HDS ?)
- **Autorité de protection des données** compétente (CNPDCP, loi n°001/2011) et formalités préalables pour un traitement de données de santé.
- **Cadre de la signature électronique** et de l'identification des patients (pièce d'identité, numéro CNAMGS ?).
- **Pharmacovigilance** : circuit national de déclaration et interlocuteur.
- **Contenu des vagues 1 à 3** tel que proposé dans `docs/deploiement/vagues.md`.

## 4. Questions ouvertes pour le porteur de projet

1. **Conclusions de l'avis juridique** à transmettre (localisation des données, médecin étranger, ordonnances, formalités CNPDCP) ; devis et contrat HDS à vérifier avant engagement.
2. Qui compose le **comité médical**, qui est **directeur médical de garde**, qui est **responsable sécurité** ? Qui reçoit le rôle **`revue-acces`** (revue des bris de glace) et sous quel **délai** (24 h proposé) ?
3. Liste fermée des **actions de niveau 4** autorisées à l'Agent 6 ?
4. Valider le **contenu des vagues** et fixer les seuils chiffrés des critères de passage.
5. **Fournisseur SMS / WhatsApp** (ADR-0012) et relecture des gabarits de notification.
6. Désigner la **personne de confiance** qui partage le rôle `gestion-invitations` (ADR-0013).
7. **ADR-0014** — durée de conservation des photos (document + visage) et texte de la **charte** à accepter avant l'envoi : à valider avec l'avis juridique ; désigner les titulaires du rôle `verification-identite`.
8. Activer les **alertes et mises à jour de sécurité Dependabot** dans les réglages du dépôt (Settings → Code security).
9. Ajouter le tableur `docs/business-plan/Mbolo_Sante_Business_Plan.xlsx`.

## 5. Leçons apprises

- 2026-09-26 — Vérifier l'existence d'un dossier avant d'y écrire en série (un `cd` échoué a interrompu une création de fichiers ; rien n'a été écrit au mauvais endroit).
- 2026-09-26 — gitleaks utilise le moteur RE2 : pas de lookahead dans les règles ; exclure les valeurs factices par l'allowlist.
- 2026-09-27 — Playwright n'intercepte pas (`page.route`) une redirection qui suit un POST : relever l'URL de retour avec l'événement `request`.
- 2026-09-27 — Un test de refus doit utiliser des identifiants valides, sinon il réussit pour une autre raison (connexion directe : vrai mot de passe, erreur `unauthorized_client` attendue).
- 2026-09-27 — Keycloak : le code OTP se calcule sur les octets bruts du champ caché `totpSecret`, et un code ne peut pas être réutilisé ; importer `authenticationFlows` conserve les flux par défaut.
- 2026-09-27 — HAPI met en cache les recherches 60 s : toujours `Cache-Control: no-cache` pour une décision d'accès (sinon une révocation n'est pas vue). HAPI impose l'intégrité référentielle (un `Consent` vers un `Practitioner` inconnu est refusé).
- 2026-09-27 — Keycloak : déclarer `clientScopes` dans un royaume importé supprime les portées par défaut ; les valeurs `${VAR}` du fichier sont remplacées par l'environnement à l'import (secrets hors dépôt). `tx.fhir.org` peut être indisponible : le validateur réessaie 3 fois.
- 2026-09-27 — Unleash 7 n'a plus la stratégie `userWithId` : cibler une cohorte par une contrainte `userId IN [...]` sur `flexibleRollout`.
- 2026-09-27 — Données e2e persistantes (créneaux) : les retirer en préparation (`entered-in-error`, jamais supprimer), sinon une 2ᵉ exécution échoue (chevauchement).
- 2026-09-27 — Fastify retire en silence les champs inconnus (`removeAdditional`) : pour refuser un texte libre, `ajv.customOptions.removeAdditional = false`.
- 2026-09-27 — WebRTC en local : sans autorisation micro/caméra, Chrome ne propose que des adresses mDNS que LiveKit ignore ; demander les médias **avant** `room.connect`.
- 2026-09-27 — E2E : après un échec, Playwright relance le worker et perd les secrets OTP en mémoire ; les scénarios suivants échouent en cascade (chercher le premier échec).
- 2026-09-27 — Preact : `value` ou `selected` sur un champ de formulaire est réappliqué à chaque rendu et écrase la saisie ; utiliser des champs non contrôlés (`defaultValue`).
- 2026-09-27 — Ne jamais utiliser `pkill -f <motif>` dans une commande qui contient ce motif : elle se tue elle-même.
- 2026-09-27 — Postgres : un quota « compter puis insérer » n'est sûr que sous verrou (`pg_advisory_xact_lock` par cohorte) ; l'usage unique se fait en un seul `UPDATE … WHERE utilise_le IS NULL … RETURNING`. Tester la concurrence sur un vrai Postgres.
- 2026-09-27 — Après une fusion, vérifier que le dernier commit poussé est bien dans `main` avant de réaligner la branche ; ne jamais forcer le push (un commit d'acceptation d'ADR a failli être perdu).
- 2026-09-27 — Extension Keycloak : une exception dans `FormAction.success` annule la transaction (le compte n'est pas créé) ; contrôler le code en dernier dans `validate` pour ne pas le « brûler » sur une autre erreur du formulaire. Le point `/registrations` exige aussi PKCE.
- 2026-09-27 — Toujours épingler Keycloak sur la dernière version corrigée : la revue des dépendances a signalé des failles hautes dans 26.0.8 (l'image `26.0` flottante en était aussi touchée).
- 2026-09-27 — `@types/fhir` s'importe via `'fhir/r4.js'` en `NodeNext` ; les fausses clés de test se construisent à l'exécution pour ne pas déclencher gitleaks.
