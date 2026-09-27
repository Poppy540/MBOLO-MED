# Ressources volontairement invalides [FICTIF]

Chacune viole une règle des profils Mbolo Santé. Le script `scripts/valider-ig.sh` vérifie que le **validateur officiel HL7 les rejette, et pour le bon motif** : le fichier `.attendu` du même nom contient le texte qui doit figurer dans le rapport. Si l'une d'elles devenait acceptée, la CI échouerait : cela signifierait qu'un garde-fou a disparu.

| Fichier | Règle violée | Motif attendu |
|---|---|---|
| `condition-confirmee-par-patient.json` | `mbolo-cond-1` : diagnostic confirmé posé par quelqu'un d'autre qu'un professionnel (principe n°1) | `mbolo-cond-1` |
| `condition-sans-statut.json` | `verificationStatus` obligatoire | `verificationStatus` |
| `consent-categorie-inconnue.json` | catégorie hors du jeu de valeurs Mbolo (consentement groupé interdit) | `TOUT-ACCEPTER` |
| `consent-proche-sans-beneficiaire.json` | `mbolo-consent-1` : consentement de partage sans bénéficiaire désigné | `mbolo-consent-1` |
