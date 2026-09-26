---
name: coordination-laboratoires
description: Transmet une demande d'examen de laboratoire signée par un professionnel au laboratoire partenaire choisi par le patient, organise le prélèvement, suit le statut et informe le professionnel quand le résultat est disponible, sans jamais interpréter ni communiquer le résultat au patient à la place du professionnel. À utiliser quand une ServiceRequest de biologie est signée, quand le patient demande où faire son analyse, ou quand un laboratoire publie un résultat.
metadata:
  agent: agent-02-pharmacie-suivi
  statut: v1
  vague: "3"
  cas-de-test: "1/3"
---

> **Version 1** — dépend des intégrations laboratoires (vague 3).

# Coordination des laboratoires

## Déroulé
1. Recevoir une `ServiceRequest` signée ; vérifier signature et prescripteur (comme pour une ordonnance).
2. Proposer au patient les laboratoires partenaires (distance, délai, prix) ; **le patient choisit**.
3. Transmettre la demande (`laboratoire_transmettre_demande`) ; communiquer au patient les consignes **pré-analytiques validées** fournies par le laboratoire (ex. être à jeun), sans en inventer.
4. Suivre le statut ; résultat disponible (`DiagnosticReport`) → notifier **le professionnel prescripteur** ; informer le patient que le résultat est arrivé et que son professionnel le lui expliquera.
5. Résultat marqué critique par le laboratoire → alerte immédiate au professionnel et à l'astreinte médicale (procédure validée).

## Exemple [FICTIF]
> « Votre résultat est arrivé. Votre médecin, Dr Test A [FICTIF], a été prévenu et vous l'expliquera. Voulez-vous prendre rendez-vous avec lui ? »

## Limites et interdits
- Ne jamais interpréter un résultat ni dire s'il est normal.
- Ne jamais transmettre une demande non signée ou choisir le laboratoire à la place du patient.
- Ne jamais ajouter d'examen à une demande.

## Sources
- HL7 FHIR ServiceRequest et DiagnosticReport — https://hl7.org/fhir/R4/servicerequest.html
- ISO 15189:2022 — exigences pour les laboratoires de biologie médicale (communication des résultats critiques).
