# Ressources volontairement invalides [FICTIF]

Chacune viole une règle des profils Mbolo Santé. Le script `scripts/valider-ig.sh` vérifie que le **validateur officiel HL7 les rejette, et pour le bon motif** : le fichier `.attendu` du même nom contient le texte qui doit figurer dans le rapport. Si l'une d'elles devenait acceptée, la CI échouerait : cela signifierait qu'un garde-fou a disparu.

| Fichier | Règle violée | Motif attendu |
|---|---|---|
| `condition-confirmee-par-patient.json` | `mbolo-cond-1` : diagnostic confirmé posé par quelqu'un d'autre qu'un professionnel (principe n°1) | `mbolo-cond-1` |
| `condition-sans-statut.json` | `verificationStatus` obligatoire | `verificationStatus` |
| `consent-categorie-inconnue.json` | catégorie hors du jeu de valeurs Mbolo (consentement groupé interdit) | `TOUT-ACCEPTER` |
| `consent-proche-sans-beneficiaire.json` | `mbolo-consent-1` : consentement de partage sans bénéficiaire désigné | `mbolo-consent-1` |
| `rendez-vous-avec-motif.json` | `mbolo-rdv-1` : motif médical dans un rendez-vous (minimisation) | `mbolo-rdv-1` |
| `rendez-vous-annule-sans-auteur.json` | `mbolo-rdv-4` : annulation avec un motif en texte libre, sans auteur codé ni date | `mbolo-rdv-4` |
| `creneau-avec-commentaire.json` | `mbolo-creneau-1` : texte libre (ici une information de santé) dans un créneau | `mbolo-creneau-1` |
| `compte-rendu-par-agent-ia.json` | `mbolo-cr-1` : compte-rendu dont l'auteur est un agent IA (principe n°1) | `mbolo-cr-1` |
| `patient-sans-prenom.json` | `mbolo-pat-1` : patient sans prénom (le professionnel doit savoir qui il soigne) | `mbolo-pat-1` |
| `patient-verifie-sans-identifiant.json` | `mbolo-pat-2` : identité « vérifiée » sans numéro d'assurance maladie ni provisoire | `mbolo-pat-2` |
| `telephone-change-sans-date.json` | `mbolo-pat-3` : numéro changé (ici après une perte) sans date du changement, qui ouvre les 24 heures sans code de connexion (ADR-0023) | `mbolo-pat-3` |
| `ordonnance-par-agent-ia.json` | `mbolo-ord-2` : ordonnance prescrite par un agent IA (principe n°1, ADR-0018) | `mbolo-ord-2` |
| `ordonnance-texte-libre.json` | `mbolo-ord-1` : consigne en texte libre dans une ordonnance (principe n°8) | `mbolo-ord-1` |
| `praticien-actif-non-verifie.json` | `mbolo-prat-1` : professionnel actif alors que sa vérification n'est pas faite (ADR-0026) | `mbolo-prat-1` |
| `praticien-verifie-sans-inscription.json` | `mbolo-prat-2` : professionnel « vérifié » sans numéro d'inscription, Ordre émetteur ni fin de validité | `mbolo-prat-2` |
