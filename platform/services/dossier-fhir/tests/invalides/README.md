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
