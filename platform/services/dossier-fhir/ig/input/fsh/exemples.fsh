// Exemples 100 % FICTIFS, marqués meta.tag = fictif. Aucune personne réelle.

Instance: fictif-patient-0001
InstanceOf: MboloPatient
Title: "[FICTIF] Patiente Test A"
Usage: #example
* meta.tag = MboloMarqueurCS#fictif
* extension[statutIdentite].valueCode = MboloStatutIdentiteCS#verifiee
* identifier.system = "https://mbolo-sante.example/fhir/identifiant/ga/assurance-maladie"
* identifier.type = MboloTypeIdentifiantPatientCS#assurance-maladie
* identifier.value = "FICTIF-0001"
* name.family = "Test"
* name.given = "Patiente A"
* gender = #female
* birthDate = "1990-01-01"
* telecom.system = #phone
* telecom.value = "+241 00 00 00 00"
* telecom.period.start = "2026-09-30T08:00:00Z"
* telecom.extension[changementTelephone].valueCode = MboloChangementTelephoneCS#perte

Instance: fictif-patient-a-verifier-0002
InstanceOf: MboloPatient
Title: "[FICTIF] Patient inscrit, identité à vérifier"
Usage: #example
* meta.tag = MboloMarqueurCS#fictif
* extension[statutIdentite].valueCode = MboloStatutIdentiteCS#a-verifier
* name.family = "Test"
* name.given = "Patient B"
* birthDate = "1985-06-15"
* telecom.system = #phone
* telecom.value = "+241 00 00 00 01"

Instance: fictif-consent-soins-0001
InstanceOf: MboloConsent
Title: "[FICTIF] Consentement C-SOINS recueilli par message vocal"
Usage: #example
* meta.tag = MboloMarqueurCS#fictif
* extension[modeRecueil].valueCode = MboloModeRecueilCS#vocal
* status = #active
* scope = $consentscope#patient-privacy
* category = MboloConsentementCS#C-SOINS
* patient = Reference(fictif-patient-0001)
* dateTime = "2026-09-26T10:15:00+01:00"
* policyRule.text = "Texte de consentement C-SOINS v0.1 (fr)"
* provision.type = #permit
* provision.purpose = $v3-ActReason#TREAT

Instance: fictif-condition-toux-0001
InstanceOf: MboloCondition
Title: "[FICTIF] Toux déclarée par la patiente (non confirmée)"
Usage: #example
* meta.tag = MboloMarqueurCS#fictif
* clinicalStatus = $condition-clinical#active
* verificationStatus = $condition-ver#unconfirmed
* category = $condition-category#problem-list-item
* code.text = "Toux depuis 5 jours (déclaré par la patiente)"
* subject = Reference(fictif-patient-0001)
* recordedDate = "2026-09-26"
* asserter = Reference(fictif-patient-0001)

Instance: fictif-provenance-0001
InstanceOf: MboloProvenance
Title: "[FICTIF] Écriture par l'agent d'accueil"
Usage: #example
* meta.tag = MboloMarqueurCS#fictif
* target = Reference(fictif-condition-toux-0001)
* recorded = "2026-09-26T10:20:00+01:00"
* agent.type = $provenance-type#author
* agent.who.display = "Agent 1 — accueil et orientation (assistant IA)"

Instance: fictif-praticien-0001
InstanceOf: MboloPraticien
Title: "[FICTIF] Médecin Test, vérifié"
Usage: #example
* meta.tag = MboloMarqueurCS#fictif
* extension[statutVerification].valueCode = MboloStatutVerificationProCS#verifie
* active = true
* name.family = "Test"
* name.given = "Médecin"
* qualification.code.text = "Médecine générale"
* qualification.identifier.value = "FICTIF-ORDRE-0001"
* qualification.issuer.display = "Ordre des médecins [FICTIF]"
* qualification.period.start = "2026-01-01"
* qualification.period.end = "2027-01-01"

Instance: fictif-praticien-0002
InstanceOf: MboloPraticien
Title: "[FICTIF] Candidat à vérifier, avec sa déclaration"
Usage: #example
* meta.tag = MboloMarqueurCS#fictif
* extension[statutVerification].valueCode = MboloStatutVerificationProCS#a-verifier
* active = false
* name.family = "Candidat"
* name.given = "Médecin"
* qualification.code = MboloSpecialiteCS#pediatrie "Pédiatrie"
* qualification.code.text = "Pédiatrie"
* qualification.identifier.value = "FICTIF-ORDRE-0002"
* qualification.issuer.identifier.system = "urn:iso:std:iso:3166"
* qualification.issuer.identifier.value = "GA"
* qualification.issuer.display = "Ordre (GA)"
* communication[0] = urn:ietf:bcp:47#fr
* communication[1] = urn:ietf:bcp:47#fan

Instance: fictif-agenda-0001
InstanceOf: MboloAgenda
Title: "[FICTIF] Agenda de téléconsultation du médecin test"
Usage: #example
* meta.tag = MboloMarqueurCS#fictif
* active = true
* serviceType = MboloModeConsultationCS#video
* actor = Reference(fictif-praticien-0001)

Instance: fictif-creneau-0001
InstanceOf: MboloCreneau
Title: "[FICTIF] Créneau réservé"
Usage: #example
* meta.tag = MboloMarqueurCS#fictif
* schedule = Reference(fictif-agenda-0001)
* status = #busy
* serviceType = MboloModeConsultationCS#video
* start = "2026-10-01T09:00:00+01:00"
* end = "2026-10-01T09:20:00+01:00"

Instance: fictif-creneau-0002
InstanceOf: MboloCreneau
Title: "[FICTIF] Créneau libre"
Usage: #example
* meta.tag = MboloMarqueurCS#fictif
* schedule = Reference(fictif-agenda-0001)
* status = #free
* serviceType = MboloModeConsultationCS#video
* start = "2026-10-01T09:20:00+01:00"
* end = "2026-10-01T09:40:00+01:00"

Instance: fictif-rendez-vous-0001
InstanceOf: MboloRendezVous
Title: "[FICTIF] Téléconsultation vidéo prévue"
Usage: #example
* meta.tag = MboloMarqueurCS#fictif
* status = #booked
* slot = Reference(fictif-creneau-0001)
* serviceType = MboloModeConsultationCS#video
* start = "2026-10-01T09:00:00+01:00"
* end = "2026-10-01T09:20:00+01:00"
* minutesDuration = 20
* participant[0].actor = Reference(fictif-patient-0001)
* participant[0].status = #accepted
* participant[1].actor = Reference(fictif-praticien-0001)
* participant[1].status = #accepted

Instance: fictif-rendez-vous-annule-0001
InstanceOf: MboloRendezVous
Title: "[FICTIF] Téléconsultation annulée par la patiente"
Usage: #example
* meta.tag = MboloMarqueurCS#fictif
* extension[dateAnnulation].valueDateTime = "2026-09-30T18:00:00+01:00"
* status = #cancelled
* cancelationReason = MboloAnnulationCS#patient
* serviceType = MboloModeConsultationCS#video
* start = "2026-10-01T09:00:00+01:00"
* end = "2026-10-01T09:20:00+01:00"
* minutesDuration = 20
* participant[0].actor = Reference(fictif-patient-0001)
* participant[0].status = #declined
* participant[1].actor = Reference(fictif-praticien-0001)
* participant[1].status = #accepted

Instance: fictif-compte-rendu-0001
InstanceOf: MboloCompteRendu
Title: "[FICTIF] Compte-rendu de téléconsultation"
Usage: #example
* meta.tag = MboloMarqueurCS#fictif
* status = #final
* type = MboloTypeDocumentCS#compte-rendu-teleconsultation
* subject = Reference(fictif-patient-0001)
* date = "2026-10-01T09:25:00+01:00"
* author = Reference(fictif-praticien-0001)
* title = "Compte-rendu de téléconsultation"
* event.detail = Reference(fictif-rendez-vous-0001)
* section[0].code = MboloSectionCompteRenduCS#motif
* section[0].text.status = #generated
* section[0].text.div = "<div xmlns=\"http://www.w3.org/1999/xhtml\">[FICTIF] Toux depuis 5 jours.</div>"
* section[1].code = MboloSectionCompteRenduCS#conclusion
* section[1].text.status = #generated
* section[1].text.div = "<div xmlns=\"http://www.w3.org/1999/xhtml\">[FICTIF] Conclusion du médecin test.</div>"

Instance: fictif-ordonnance-0001
InstanceOf: MboloOrdonnance
Title: "[FICTIF] Ligne d'ordonnance : paracétamol"
Usage: #example
* meta.tag = MboloMarqueurCS#fictif
* status = #active
* intent = #order
* groupIdentifier.system = "https://mbolo-sante.example/fhir/identifiant-ordonnance"
* groupIdentifier.value = "FICTIF-ORD-0001"
* identifier[0].system = "https://mbolo-sante.example/fhir/identifiant-ordonnance"
* identifier[0].value = "FICTIF-ORD-0001"
* medicationCodeableConcept = $atc#N02BE01 "paracetamol"
* subject = Reference(fictif-patient-0001)
* authoredOn = "2026-10-01T09:30:00+01:00"
* requester = Reference(fictif-praticien-0001)
* dosageInstruction[0].timing.repeat.frequency = 3
* dosageInstruction[0].timing.repeat.period = 1
* dosageInstruction[0].timing.repeat.periodUnit = #d
* dosageInstruction[0].timing.repeat.boundsDuration = 5 'd' "jours"
* dosageInstruction[0].doseAndRate[0].doseQuantity = 500 'mg' "mg"
* dispenseRequest.validityPeriod.start = "2026-10-01"
* dispenseRequest.validityPeriod.end = "2026-12-30"
* dispenseRequest.numberOfRepeatsAllowed = 0
