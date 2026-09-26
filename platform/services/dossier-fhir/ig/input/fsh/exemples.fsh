// Exemples 100 % FICTIFS, marqués meta.tag = fictif. Aucune personne réelle.

Instance: fictif-patient-0001
InstanceOf: MboloPatient
Title: "[FICTIF] Patiente Test A"
Usage: #example
* meta.tag = MboloMarqueurCS#fictif
* identifier.system = "https://mbolo-sante.example/fhir/identifiant-patient"
* identifier.value = "FICTIF-0001"
* name.family = "Test"
* name.given = "Patiente A"
* gender = #female
* birthDate = "1990-01-01"
* telecom.system = #phone
* telecom.value = "+241 00 00 00 00"

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
