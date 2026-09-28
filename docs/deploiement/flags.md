# Registre des feature flags — Mbolo Santé

> Source de vérité du code : `platform/packages/drapeaux/src/catalogue.ts` (un test vérifie les noms, les dépendances et l'absence de cycle). Ce registre ajoute les prérequis et le plan de retour arrière. **Toute activation en production est décidée et faite par un humain habilité** (ADR-0003, ADR-0007). L'Agent 6 prépare la demande (skill `feature-flags-vagues`), il n'active jamais.

## Règles

- **Désactivé par défaut.** Sans Unleash, flag inconnu ou erreur d'évaluation : la fonction reste désactivée.
- **Jamais de flag sur la sécurité** : authentification, MFA, consentement obligatoire, contrôle d'accès, journalisation, orientation vers les urgences.
- **Ciblage** : `ville`, `specialite`, `typeUtilisateur`, `vague`, et identifiant technique du compte (`userId`) pour une cohorte. Aucune donnée de santé dans le contexte.
- **Dépendances** : un flag n'est actif que si ceux dont il dépend le sont.
- **Activation progressive** : cohorte limitée, puis élargissement. Chaque changement est journalisé par Unleash (qui, quand).
- **Nettoyage** : un flag stabilisé est retiré du code et d'Unleash après la revue de vague.

## Flags

| Flag | Vague | Branché | Dépend de | Prérequis avant activation | Retour arrière |
|---|---|---|---|---|---|
| `consentement.proche` | 2 | Oui (`identite`) | — | Parcours de consentement des proches validé (skill `consentement-proches-diaspora`), avis juridique sur l'accès des proches, tests e2e au vert | Désactiver le flag : plus aucun **nouveau** partage. Les consentements déjà donnés restent valables jusqu'à révocation par le patient. |
| `teleconsultation.video` | 1 | Oui (`teleconsultation`, prototype) | — | Test terrain réseau mobile (ADR-0011), applications patient et professionnel | Désactiver : plus de nouveau rendez-vous ni d'entrée en salle ; les salles en cours se ferment à leur expiration ; **l'annulation et le retrait de créneaux restent possibles** (pas de rendez-vous fantôme) |
| `identite.photos` | 1 | Oui (`documents`, application patient) | — | **Charte validée** par le porteur de projet et le juriste (base légale, durée de conservation, mineurs, coordonnées DPO et CNPDCP) et reprise mot pour mot dans l'application ; hébergement HDS du stockage (ADR-0004) ; titulaires du rôle `verification-identite` nommés ; écran du vérificateur en service ; tests e2e au vert | Désactiver : plus aucune **nouvelle** photo ; les photos déjà reçues restent chiffrées, vérifiées puis supprimées à échéance ; le patient peut être vérifié en personne |
| `paiement.mobile-money` | 1 | Oui (`paiement` ; rendez-vous à brancher) | — | ADR-0017 acceptée ; contrat avec l'agrégateur et vrai fournisseur branché (le fournisseur simulé refuse la production) ; grille de prix validée ; règles de remboursement ; recette des paiements (accepté, refusé, expiré) ; tests e2e au vert | Désactiver : plus aucune **nouvelle** collecte ; les paiements en attente restent relus chez le prestataire et conclus ; la réservation redevient gratuite pour la cohorte |
| `agent01.accueil` | 1 | Non | `teleconsultation.video` | Skills de l'Agent 1 en statut `complet` (3 cas de test au vert, dont refus et escalade), validation du comité médical | Désactiver : accueil par un humain uniquement |

## Environnements Unleash

| Environnement | Qui modifie | Jeton des services |
|---|---|---|
| `development` | Équipe technique ; tests e2e (jeton d'administration éphémère) | `UNLEASH_BACKEND_TOKEN` (évaluation seule) |
| `recette` | Équipe technique | idem |
| `production` | Humains habilités uniquement ; l'Agent 6 en lecture seule | idem |
