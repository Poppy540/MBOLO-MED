# Architecture — Mbolo Santé

> Les décisions d'architecture sont consignées sous forme d'ADR (Architecture Decision Record) dans `adr/`, au format de `adr/0000-modele.md`.

| ADR | Titre | Statut |
|---|---|---|
| [0001](adr/0001-fhir.md) | Dossier médical au format HL7 FHIR | Acceptée |
| [0002](adr/0002-webrtc-faible-debit.md) | Vidéo WebRTC adaptée au faible débit | Acceptée (outil à choisir) |
| [0003](adr/0003-feature-flags.md) | Déploiement progressif par feature flags | Acceptée (outil : ADR-0007) |
| [0004](adr/0004-hebergement-donnees-sante.md) | Hébergement des données de santé : OVHcloud HDS | Acceptée **sous réserve de l'avis juridique** |
| [0005](adr/0005-coffre-fort-secrets.md) | Coffre-fort de secrets : Infisical | Acceptée |
| [0006](adr/0006-messagerie-salle-de-controle.md) | Messagerie de la salle de contrôle : Slack + astreinte | Acceptée |
| [0007](adr/0007-feature-flags-unleash.md) | Feature flags : Unleash (OpenFeature) | Acceptée |
| [0008](adr/0008-socle-technique.md) | Socle technique : monorepo TypeScript, pnpm, CI GitHub Actions | Acceptée |
| [0009](adr/0009-identite-controle-acces.md) | Identité (Keycloak), contrôle d'accès au dossier, consentements, bris de glace | Proposée |
| [0010](adr/0010-passerelle-dossier.md) | Passerelle du dossier médical, comptes de service, permissions SMART | Proposée |
| [0011](adr/0011-serveur-webrtc.md) | Serveur de téléconsultation vidéo : LiveKit | Acceptée (prototype et test terrain à venir) |
| [0012](adr/0012-notifications.md) | Service de notifications (SMS, WhatsApp), gabarits approuvés | Proposée (fournisseur à choisir) |
| [0013](adr/0013-base-de-donnees-services.md) | Base de données des services (hors dossier médical), premier usage : codes d'invitation | Acceptée |
| [0014](adr/0014-inscription-patient.md) | Inscription d'un patient avec un code d'invitation (extension Keycloak, identité vérifiée) | Acceptée (vérification à préciser) |
| [0015](adr/0015-stockage-documents-verification-identite.md) | Stockage chiffré des documents et vérification d'identité | Acceptée (durée de conservation à fixer) |
| [0016](adr/0016-preparation-production.md) | Préparation de la production : clé maître (KMS), supervision et alertes, authentification des services | Acceptée (destinataires des alertes à désigner) |
| [0017](adr/0017-paiement-mobile-money.md) | Paiement des consultations par mobile money (agrégateur, parcours, données) | Proposée (prestataire à choisir sur devis) |

## Vue d'ensemble (cible, à détailler)

- **Apps** : patient, professionnel, pharmacie, académie, backoffice (`platform/apps/`).
- **Services** : identité, dossier-fhir, téléconsultation, ordonnances, paiement, notifications, feature-flags (`platform/services/`).
- **Agents IA** : accèdent aux services **par des outils à portée minimale**, jamais directement à la base ni aux secrets.
- **Interopérabilité** : FHIR R4 ; passerelle vers eGabon-SIS (standard à confirmer).
