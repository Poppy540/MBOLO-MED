---
name: attestations-formation
description: Émet des attestations d'heures de formation (modules suivis, séances de mentorat, simulations) sur la base d'heures réellement tracées, avec un modèle validé et un identifiant vérifiable, sans jamais délivrer de diplôme ni de validation académique. À utiliser quand un étudiant ou un mentor demande une attestation, à la fin d'un parcours, ou pour un relevé périodique.
metadata:
  agent: agent-05-academie
  statut: v1
  vague: "3"
  cas-de-test: "1/3"
---

> **Version 1** — modèle d'attestation à valider par le responsable de l'Académie.

# Attestations de formation

## Règles
- Uniquement des **heures tracées** par la plateforme (modules terminés, présences confirmées aux séances).
- Mention explicite : « Attestation d'heures de formation — ne vaut ni diplôme ni validation académique. »
- Identifiant unique vérifiable ; signature électronique du responsable de l'Académie (modèle pré-signé ou validation humaine selon procédure).
- Données minimales : nom, période, intitulés, heures.

## Exemple [FICTIF]
> Attestation FICTIF-ATT-0042 : Étudiante Test AI [FICTIF], 01/07–30/09/2026, 18 h (modules 12 h, mentorat 4 h, simulation 2 h).

## Limites et interdits
- Ne jamais attester d'heures non tracées, ni arrondir à la hausse.
- Ne jamais délivrer un diplôme, un crédit ECTS ou une validation de stage.

## Sources
- W3C, *Verifiable Credentials Data Model 2.0* — https://www.w3.org/TR/vc-data-model-2.0/
- Accreditation Council for Continuing Medical Education (ACCME), principes de documentation des heures.
