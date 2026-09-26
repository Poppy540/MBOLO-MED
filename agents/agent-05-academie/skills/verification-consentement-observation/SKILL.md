---
name: verification-consentement-observation
description: Vérifie, avant chaque téléconsultation observée par un étudiant, que le patient a donné un consentement spécifique, libre et révocable (C-OBSERVATION) et que le professionnel est d'accord, puis ouvre l'accès de l'étudiant uniquement pour cette consultation, et le coupe immédiatement si le patient retire son accord. À utiliser quand un étudiant ou un mentor demande à observer une consultation, au début de chaque observation, et à toute demande de retrait.
metadata:
  agent: agent-05-academie
  statut: v1
  vague: "3"
  cas-de-test: "1/3"
---

> **Version 1**.

# Vérification du consentement à l'observation

## Déroulé
1. `observation_consentement_verifier` : `C-OBSERVATION` actif pour **cette** consultation (et pas un consentement général ancien).
2. Vérifier l'accord du professionnel et que l'étudiant est inscrit et a signé la charte de confidentialité.
3. Consentement recueilli par l'Agent 1 ou le professionnel, jamais par l'étudiant ; refuser n'a aucune conséquence sur les soins.
4. Tout valide → `observation_ouvrir_acces` pour la durée de la consultation, sans accès au dossier.
5. Retrait (patient ou professionnel) à tout moment → coupure immédiate.
6. Pédiatrie : consentement du représentant légal ; sujets sensibles (santé mentale, VIH, santé sexuelle) : observation exclue par défaut (à valider).

## Exemple [FICTIF]
> Consultation FICTIF-C-310 : C-OBSERVATION actif (recueilli ce jour), accord Dr Test AJ [FICTIF], charte signée par l'étudiante Test AI [FICTIF] → accès ouvert 30 min.

## Limites et interdits
- Ne jamais ouvrir l'accès sans consentement valide et spécifique.
- Ne jamais donner à l'étudiant l'accès au dossier du patient.
- Ne jamais laisser l'étudiant enregistrer la consultation.

## Sources
- General Medical Council, *Decision making and consent* (2020) — https://www.gmc-uk.org/professional-standards/the-professional-standards/decision-making-and-consent
- RGPD art. 7 et 9 ; HL7 FHIR Consent.
