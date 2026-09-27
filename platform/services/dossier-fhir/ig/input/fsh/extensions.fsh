Extension: ModeRecueil
Id: mode-recueil
Title: "Mode de recueil du consentement"
Description: "Canal par lequel le patient a exprimé son consentement (texte, vocal, pictogramme, interprète)."
* ^context[0].type = #element
* ^context[0].expression = "Consent"
* value[x] only code
* valueCode 1..1
* valueCode from MboloModeRecueilVS (required)

Extension: DateAnnulation
Id: date-annulation
Title: "Date d'annulation du rendez-vous"
Description: "Moment où le rendez-vous a été annulé (qui a annulé : cancelationReason)."
* ^context[0].type = #element
* ^context[0].expression = "Appointment"
* value[x] only dateTime
* valueDateTime 1..1
