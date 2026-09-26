# Architecture — Mbolo Santé

> Les décisions d'architecture sont consignées sous forme d'ADR (Architecture Decision Record) dans `adr/`, au format de `adr/0000-modele.md`.

| ADR | Titre | Statut |
|---|---|---|
| [0001](adr/0001-fhir.md) | Dossier médical au format HL7 FHIR | Acceptée |
| [0002](adr/0002-webrtc-faible-debit.md) | Vidéo WebRTC adaptée au faible débit | Acceptée (outil à choisir) |
| [0003](adr/0003-feature-flags.md) | Déploiement progressif par feature flags | Acceptée (outil à choisir) |

## Vue d'ensemble (cible, à détailler)

- **Apps** : patient, professionnel, pharmacie, académie, backoffice (`platform/apps/`).
- **Services** : identité, dossier-fhir, téléconsultation, ordonnances, paiement, notifications, feature-flags (`platform/services/`).
- **Agents IA** : accèdent aux services **par des outils à portée minimale**, jamais directement à la base ni aux secrets.
- **Interopérabilité** : FHIR R4 ; passerelle vers eGabon-SIS (standard à confirmer).
