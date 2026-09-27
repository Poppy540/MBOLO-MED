// Profils Mbolo Santé (ADR-0001). Les règles reprennent les principes non négociables.

Invariant: mbolo-cond-1
Description: "Principe n°1 : un diagnostic confirmé, ou un diagnostic de consultation, ne peut être posé que par un professionnel de santé (Practitioner ou PractitionerRole). Un agent IA ou un patient ne peut déclarer qu'une information non confirmée."
Expression: "(verificationStatus.coding.where(code = 'confirmed').exists() or category.coding.where(code = 'encounter-diagnosis').exists()) implies asserter.reference.startsWith('Practitioner')"
Severity: #error

Invariant: mbolo-consent-1
Description: "Un consentement de partage (C-PARTAGE-PRO, C-PROCHE) doit désigner son bénéficiaire (provision.actor) : on consent toujours à un partage avec quelqu'un de précis."
Expression: "category.coding.where(code = 'C-PARTAGE-PRO' or code = 'C-PROCHE').exists() implies provision.actor.exists()"
Severity: #error

Profile: MboloPatient
Parent: Patient
Id: mbolo-patient
Title: "Patient Mbolo Santé"
Description: "Patient avec le minimum d'informations nécessaires (minimisation)."
* ^status = #draft
* ^experimental = true
* identifier 1..* MS
* identifier.system 1..1
* identifier.value 1..1
* name 1..* MS
* gender MS
* birthDate MS
* telecom MS

Profile: MboloConsent
Parent: Consent
Id: mbolo-consent
Title: "Consentement Mbolo Santé"
Description: "Un consentement explicite, spécifique à un usage, horodaté et révocable (skill recueil-consentement)."
* ^status = #draft
* ^experimental = true
* obeys mbolo-consent-1
* extension contains ModeRecueil named modeRecueil 0..1 MS
* status MS
* category 1..1 MS
* category from MboloConsentementVS (required)
* patient 1..1 MS
* patient only Reference(MboloPatient)
* dateTime 1..1 MS
* policyRule 1..1 MS
* provision 1..1 MS
* provision.type 1..1 MS

Profile: MboloCondition
Parent: Condition
Id: mbolo-condition
Title: "Problème de santé Mbolo Santé"
Description: "Problème de santé, déclaré (non confirmé) ou posé par un professionnel. Le statut de vérification et l'auteur sont obligatoires."
* ^status = #draft
* ^experimental = true
* obeys mbolo-cond-1
* verificationStatus 1..1 MS
* category 1..* MS
* code 1..1 MS
* subject MS
* subject only Reference(MboloPatient)
* recordedDate 1..1 MS
* asserter 1..1 MS

Profile: MboloProvenance
Parent: Provenance
Id: mbolo-provenance
Title: "Provenance Mbolo Santé"
Description: "Qui a écrit quoi, quand, et à partir de quelle source. Obligatoire pour toute écriture d'un agent IA."
* ^status = #draft
* ^experimental = true
* target 1..* MS
* recorded MS
* agent 1..* MS
* agent.type 1..1 MS
* agent.who MS
