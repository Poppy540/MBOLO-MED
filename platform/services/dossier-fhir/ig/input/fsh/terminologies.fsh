// Terminologies propres à Mbolo Santé.

CodeSystem: MboloConsentementCS
Id: mbolo-consentement
Title: "Catégories de consentement Mbolo Santé"
Description: "Un consentement distinct par usage des données (skill recueil-consentement)."
* ^status = #draft
* ^caseSensitive = true
* ^experimental = true
* #C-SOINS "Soins" "Collecte et traitement des données de santé pour préparer et réaliser la consultation."
* #C-PARTAGE-PRO "Partage avec le professionnel" "Partage du dossier avec le professionnel choisi par le patient."
* #C-PROCHE "Accès d'un proche" "Accès d'un proche ou aidant nommé, selon le niveau choisi par le patient."
* #C-RAPPELS "Rappels" "Envoi de rappels de prise et de rendez-vous."
* #C-OBSERVATION "Observation par un étudiant" "Présence d'un étudiant de l'Académie Mbolo pendant une consultation."
* #C-PHOTOS "Conservation de photos" "Conservation de photos de documents médicaux dans le dossier."

ValueSet: MboloConsentementVS
Id: mbolo-consentement
Title: "Catégories de consentement Mbolo Santé"
Description: "Toutes les catégories de consentement Mbolo Santé."
* ^status = #draft
* ^experimental = true
* include codes from system MboloConsentementCS

CodeSystem: MboloModeRecueilCS
Id: mbolo-mode-recueil
Title: "Mode de recueil du consentement"
Description: "Canal par lequel le consentement a été exprimé."
* ^status = #draft
* ^caseSensitive = true
* ^experimental = true
* #texte "Texte" "Réponse écrite explicite."
* #vocal "Vocal" "Message vocal explicite, transcrit et confirmé."
* #pictogramme "Pictogramme" "Bouton ou pictogramme explicite."
* #interprete "Avec interprète" "Consentement exprimé par l'intermédiaire d'un interprète humain."

ValueSet: MboloModeRecueilVS
Id: mbolo-mode-recueil
Title: "Modes de recueil du consentement"
Description: "Tous les modes de recueil du consentement."
* ^status = #draft
* ^experimental = true
* include codes from system MboloModeRecueilCS

CodeSystem: MboloMarqueurCS
Id: mbolo-marqueur
Title: "Marqueurs de données Mbolo Santé"
Description: "Marqueurs posés dans meta.tag. Toute donnée hors production porte le marqueur fictif (principe n°4)."
* ^status = #draft
* ^caseSensitive = true
* ^experimental = true
* #fictif "Donnée fictive" "Donnée inventée pour le développement, les tests ou la formation. Ne concerne aucune personne réelle."

CodeSystem: MboloModeConsultationCS
Id: mbolo-mode-consultation
Title: "Mode de consultation Mbolo Santé"
Description: "Canal prévu pour une téléconsultation (ADR-0002, ADR-0011)."
* ^status = #draft
* ^caseSensitive = true
* ^experimental = true
* #video "Vidéo" "Téléconsultation vidéo, avec repli audio si le réseau est insuffisant."

ValueSet: MboloModeConsultationVS
Id: mbolo-mode-consultation
Title: "Modes de consultation Mbolo Santé"
Description: "Tous les modes de consultation Mbolo Santé."
* ^status = #draft
* ^experimental = true
* include codes from system MboloModeConsultationCS

CodeSystem: MboloAnnulationCS
Id: mbolo-annulation
Title: "Auteur de l'annulation d'un rendez-vous"
Description: "Qui a annulé le rendez-vous. Jamais de motif en texte libre (minimisation)."
* ^status = #draft
* ^caseSensitive = true
* ^experimental = true
* #patient "Annulé par le patient" "Le patient a annulé le rendez-vous."
* #professionnel "Annulé par le professionnel" "Le professionnel de santé a annulé le rendez-vous."

ValueSet: MboloAnnulationVS
Id: mbolo-annulation
Title: "Auteurs d'annulation d'un rendez-vous"
Description: "Tous les auteurs possibles d'une annulation."
* ^status = #draft
* ^experimental = true
* include codes from system MboloAnnulationCS
