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
- **Vague 1 — téléconsultation :** ADR-0011 proposée (LiveKit recommandé face à Jitsi), en attente de la décision du porteur de projet ; prototype et test terrain ensuite.
- **Protection de `main` à vérifier** : les PR E, F et H ont été fusionnées avant la fin de la CI (contrôles obligatoires non appliqués ou contournés par l'administrateur).
- **Réseau de l'environnement Claude Code :** `packages.fhir.org`, `hl7.org`, `build.fhir.org`, `quay.io` bloqués → validation FHIR officielle uniquement en CI GitHub ; Keycloak lancé localement depuis l'archive des versions GitHub, HAPI depuis la couche de l'image Docker Hub (`app/main.war`, Java 21) ; Unleash 7 via npm sur un Postgres 16 local (port 5433) ; pas de démon Docker ; script de relance dans le dossier de travail.
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
5. **Serveur de téléconsultation** : LiveKit (recommandé) ou Jitsi ? (ADR-0011)
6. Ajouter le tableur `docs/business-plan/Mbolo_Sante_Business_Plan.xlsx`.

## 5. Leçons apprises

- 2026-09-26 — Vérifier l'existence d'un dossier avant d'y écrire en série (un `cd` échoué a interrompu une création de fichiers ; rien n'a été écrit au mauvais endroit).
- 2026-09-26 — gitleaks utilise le moteur RE2 : pas de lookahead dans les règles ; exclure les valeurs factices par l'allowlist.
- 2026-09-27 — Playwright n'intercepte pas (`page.route`) une redirection qui suit un POST : relever l'URL de retour avec l'événement `request`.
- 2026-09-27 — Un test de refus doit utiliser des identifiants valides, sinon il réussit pour une autre raison (connexion directe : vrai mot de passe, erreur `unauthorized_client` attendue).
- 2026-09-27 — Keycloak : le code OTP se calcule sur les octets bruts du champ caché `totpSecret`, et un code ne peut pas être réutilisé ; importer `authenticationFlows` conserve les flux par défaut.
- 2026-09-27 — HAPI met en cache les recherches 60 s : toujours `Cache-Control: no-cache` pour une décision d'accès (sinon une révocation n'est pas vue). HAPI impose l'intégrité référentielle (un `Consent` vers un `Practitioner` inconnu est refusé).
- 2026-09-27 — Keycloak : déclarer `clientScopes` dans un royaume importé supprime les portées par défaut ; les valeurs `${VAR}` du fichier sont remplacées par l'environnement à l'import (secrets hors dépôt). `tx.fhir.org` peut être indisponible : le validateur réessaie 3 fois.
- 2026-09-27 — Unleash 7 n'a plus la stratégie `userWithId` : cibler une cohorte par une contrainte `userId IN [...]` sur `flexibleRollout`.
- 2026-09-27 — Ne jamais utiliser `pkill -f <motif>` dans une commande qui contient ce motif : elle se tue elle-même.
- 2026-09-27 — `@types/fhir` s'importe via `'fhir/r4.js'` en `NodeNext` ; les fausses clés de test se construisent à l'exécution pour ne pas déclencher gitleaks.
