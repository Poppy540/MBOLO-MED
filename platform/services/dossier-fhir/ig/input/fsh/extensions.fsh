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

Extension: StatutIdentite
Id: statut-identite
Title: "Statut de la vérification d'identité"
Description: "Où en est la vérification d'identité du patient (ADR-0014). Le détail du contrôle (qui, quand) est tracé dans le journal des accès, jamais ici."
* ^context[0].type = #element
* ^context[0].expression = "Patient"
* value[x] only code
* valueCode 1..1
* valueCode from MboloStatutIdentiteVS (required)

Extension: ChangementTelephone
Id: changement-telephone
Title: "Changement du numéro"
Description: "Comment le numéro du patient a été changé (ADR-0023) : par le patient avec les deux numéros, ou après une perte, sur décision d'une personne habilitée. La date du changement est dans `period.start`. Après une perte, aucun code de connexion n'est envoyé pendant 24 heures."
* ^context[0].type = #element
* ^context[0].expression = "Patient.telecom"
* value[x] only code
* valueCode 1..1
* valueCode from MboloChangementTelephoneVS (required)
