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

Invariant: mbolo-rdv-1
Description: "Minimisation : un rendez-vous de téléconsultation ne contient aucun motif, symptôme ni commentaire. Ces informations restent dans le dossier, sous consentement."
Expression: "reasonCode.empty() and reasonReference.empty() and supportingInformation.empty() and description.empty() and comment.empty() and patientInstruction.empty()"
Severity: #error

Invariant: mbolo-rdv-2
Description: "Un rendez-vous de téléconsultation réunit exactement un patient et un professionnel de santé."
Expression: "participant.where(actor.reference.startsWith('Patient/')).count() = 1 and participant.where(actor.reference.startsWith('Practitioner/')).count() = 1"
Severity: #error

Invariant: mbolo-rdv-3
Description: "La fin d'un rendez-vous est postérieure à son début."
Expression: "end > start"
Severity: #error

Invariant: mbolo-rdv-4
Description: "Un rendez-vous annulé indique qui l'a annulé (code, sans texte libre) et quand."
Expression: "status = 'cancelled' implies (cancelationReason.coding.exists() and cancelationReason.text.empty() and extension.where(url = 'https://mbolo-sante.example/fhir/StructureDefinition/date-annulation').exists())"
Severity: #error

Profile: MboloRendezVous
Parent: Appointment
Id: mbolo-rendez-vous
Title: "Rendez-vous de téléconsultation Mbolo Santé"
Description: "Rendez-vous entre un patient et un professionnel de santé (ADR-0011), sans motif médical (minimisation)."
* ^status = #draft
* ^experimental = true
* obeys mbolo-rdv-1 and mbolo-rdv-2 and mbolo-rdv-3 and mbolo-rdv-4
* extension contains DateAnnulation named dateAnnulation 0..1 MS
* cancelationReason MS
* cancelationReason from MboloAnnulationVS (required)
* status MS
* serviceType 1..1 MS
* serviceType from MboloModeConsultationVS (required)
* start 1..1 MS
* end 1..1 MS
* minutesDuration 1..1 MS
* participant 2..2 MS
* participant.actor 1..1 MS
* participant.actor only Reference(MboloPatient or Practitioner)
* slot 0..1 MS
* slot only Reference(MboloCreneau)

Invariant: mbolo-agenda-1
Description: "Un agenda de téléconsultation appartient à un seul professionnel de santé."
Expression: "actor.count() = 1 and actor.reference.startsWith('Practitioner/')"
Severity: #error

Invariant: mbolo-creneau-1
Description: "Minimisation : un créneau ne contient aucun commentaire ni texte libre."
Expression: "comment.empty()"
Severity: #error

Invariant: mbolo-creneau-2
Description: "La fin d'un créneau est postérieure à son début."
Expression: "end > start"
Severity: #error

Profile: MboloAgenda
Parent: Schedule
Id: mbolo-agenda
Title: "Agenda de téléconsultation Mbolo Santé"
Description: "Agenda d'un professionnel de santé, qui regroupe les créneaux qu'il publie."
* ^status = #draft
* ^experimental = true
* obeys mbolo-agenda-1
* active 1..1 MS
* serviceType 1..1 MS
* serviceType from MboloModeConsultationVS (required)
* actor MS
* actor only Reference(Practitioner)
* comment 0..0

Profile: MboloCreneau
Parent: Slot
Id: mbolo-creneau
Title: "Créneau de téléconsultation Mbolo Santé"
Description: "Plage publiée par un professionnel, libre (free) ou réservée (busy). Jamais de texte libre."
* ^status = #draft
* ^experimental = true
* obeys mbolo-creneau-1 and mbolo-creneau-2
* schedule MS
* schedule only Reference(MboloAgenda)
* status MS
* serviceType 1..1 MS
* serviceType from MboloModeConsultationVS (required)
* start MS
* end MS

Invariant: mbolo-cr-1
Description: "Principe n°1 : un compte-rendu de consultation est rédigé par un seul professionnel de santé, jamais par un agent IA ni par le patient."
Expression: "author.count() = 1 and author.all(reference.startsWith('Practitioner/'))"
Severity: #error

Invariant: mbolo-cr-2
Description: "Chaque section du compte-rendu porte un texte rédigé par le professionnel."
Expression: "section.all(text.exists())"
Severity: #error

Profile: MboloCompteRendu
Parent: Composition
Id: mbolo-compte-rendu
Title: "Compte-rendu de téléconsultation Mbolo Santé"
Description: "Compte-rendu rédigé et signé par le professionnel de santé après une téléconsultation. Sections fixes : motif, observations, conclusion, conduite à tenir."
* ^status = #draft
* ^experimental = true
* obeys mbolo-cr-1 and mbolo-cr-2
* status MS
* type = MboloTypeDocumentCS#compte-rendu-teleconsultation
* subject 1..1 MS
* subject only Reference(MboloPatient)
* date MS
* author 1..1 MS
* author only Reference(Practitioner)
* title MS
* event MS
* section 1..* MS
* section.code 1..1 MS
* section.code from MboloSectionCompteRenduVS (required)
* section.text 1..1 MS
