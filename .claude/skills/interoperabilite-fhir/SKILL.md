---
name: interoperabilite-fhir
description: Veille à la conformité et à l'interopérabilité du dossier médical HL7 FHIR R4 de Mbolo Santé — profils et Implementation Guide « Mbolo », terminologies (LOINC, CIM, SNOMED selon licences), SMART on FHIR et scopes par agent, validation des ressources, AuditEvent et Provenance, échanges avec laboratoires et pharmacies. À utiliser pour toute évolution du modèle de données clinique, toute nouvelle intégration, et pour vérifier que les agents écrivent des ressources valides.
metadata:
  agent: pilote-architecture
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1** — le profil Mbolo sera aligné sur le standard d'eGabon-SIS dès qu'il sera connu.

# Interopérabilité FHIR

## Points de contrôle
1. **Version** : FHIR R4 (ADR-0001).
2. **Profils** : Implementation Guide « Mbolo » (FHIR Shorthand / SUSHI) pour Patient, Encounter, Observation, Condition (dont `verificationStatus` obligatoire), Consent, MedicationRequest ; s'appuyer sur l'IPS quand c'est possible.
3. **Terminologies** : LOINC (observations), CIM-10/CIM-11 (diagnostics posés par les professionnels), SNOMED CT si licence ; codes locaux documentés dans des CodeSystem Mbolo.
4. **Sécurité** : SMART on FHIR, scopes minimaux par client (voir `secrets/inventaire-cles.md`), `AuditEvent` pour tout accès, `Provenance` pour toute écriture d'agent.
5. **Validation** : validateur FHIR officiel dans la CI sur des ressources fictives.
6. **Échanges** : bundles `transaction` / `message` pour laboratoires et pharmacies ; idempotence.

## Exemple [FICTIF]
> Revue : l'Agent 1 écrit des `Condition` sans `verificationStatus` → non conforme au profil Mbolo → story + test de validation dans la CI.

## Limites et interdits
- Ne jamais valider sur des données réelles ; ne jamais élargir les scopes d'un agent sans ADR et validation du responsable sécurité.

## Sources
- HL7 FHIR R4 — https://hl7.org/fhir/R4/ ; FHIR Validator — https://confluence.hl7.org/display/FHIR/Using+the+FHIR+Validator
- FHIR Shorthand — https://build.fhir.org/ig/HL7/fhir-shorthand/
- IPS — https://hl7.org/fhir/uv/ips/ ; SMART App Launch — https://hl7.org/fhir/smart-app-launch/
