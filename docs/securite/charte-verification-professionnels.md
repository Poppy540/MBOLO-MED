# Charte de vérification des professionnels de santé — BROUILLON v0.1

> **Brouillon à valider par le porteur de projet et le juriste avant toute utilisation.** Ce texte n'est pas en vigueur. Les passages entre crochets `[À COMPLÉTER]` ou `[À CONFIRMER]` attendent une décision ou l'avis juridique (ADR-0026, questions 1, 2 et 5 ; D-0003).
>
> Identifiant de version : `c-verification-pro-v0.1` (variable `DOCUMENTS_VERSION_CHARTE_PRO` du service `documents`). Toute modification du texte change l'identifiant : chaque candidat doit alors accepter la nouvelle version avant de déposer d'autres pièces.

---

## Texte présenté au professionnel

### Pourquoi nous vérifions votre dossier

Les patients de Mbolo Santé doivent pouvoir faire confiance à chaque professionnel qu'ils consultent. Avant votre première consultation, nous vérifions donc votre identité, votre diplôme et votre inscription à l'Ordre. Tant que cette vérification n'est pas terminée, votre compte reste **en attente** : vous n'avez accès à aucun patient.

### Ce que nous vous demandons

Des photos lisibles de :

1. votre **diplôme** ;
2. votre **attestation d'inscription à l'Ordre** de votre pays d'exercice, datée de moins de 3 mois [À CONFIRMER : durée] ;
3. votre **pièce d'identité** ;
4. votre **attestation d'assurance de responsabilité civile professionnelle** [À CONFIRMER par le juriste : pièce obligatoire ou non].

Photos JPEG ou PNG, 2 Mo au plus chacune, deux au plus par pièce (recto et verso, ou deux pages).

### Comment se passe la vérification

Une personne de l'équipe Mbolo Santé, **spécialement habilitée**, examine votre dossier. Ce n'est jamais la personne qui vous a recruté. Elle se connecte avec une double sécurité, et chaque consultation de vos pièces est enregistrée : on sait qui a regardé, et quand.

Pour chaque point, elle consulte la **source officielle** : le registre public de l'Ordre de votre pays, ou une attestation demandée directement à l'Ordre. [À CONFIRMER : un court entretien vidéo pour confirmer votre identité.]

**Aucun programme informatique ni intelligence artificielle ne décide à sa place.** Un assistant peut préparer une recherche dans les registres publics, mais la décision est toujours prise par une personne.

### Où sont gardées vos pièces, et combien de temps

Vos pièces sont gardées **chiffrées** (illisibles sans clé), chez notre hébergeur de données de santé [À CONFIRMER : nom et pays, ADR-0004].

Nous les gardons pendant votre collaboration avec Mbolo Santé, puis [À CONFIRMER par le juriste : 1 an] ; si votre candidature n'est pas retenue, pendant [À CONFIRMER : 6 mois]. Ensuite, elles sont supprimées. Nous gardons seulement le résultat de la vérification : par qui, quand, et quelles sources ont été consultées.

### Ce que nous ne faisons jamais

- Nous ne montrons pas vos pièces aux patients : ils voient seulement votre nom, votre spécialité et le fait que vous êtes vérifié.
- Nous ne vendons pas vos pièces ni vos informations, et ne les utilisons pas pour de la publicité.
- Nous ne les donnons à personne d'autre, sauf à l'Ordre concerné pour la vérification ou si la loi nous y oblige.

### Vos droits

Vous pouvez à tout moment :

- **voir** les informations que nous avons sur vous ;
- **les faire corriger** si elles sont fausses ;
- **retirer votre candidature** et demander la suppression de vos pièces. La décision de vérification et ses sources peuvent devoir être gardées le temps fixé par la loi [À CONFIRMER].

Pour cela, contactez [À COMPLÉTER : responsable de la protection des données, téléphone et adresse].

Vous pouvez aussi vous adresser à l'autorité de protection des données personnelles : au Gabon, la CNPDCP [À CONFIRMER : coordonnées]. Si vous résidez dans l'Union européenne, l'autorité de votre pays, au titre du RGPD.

### Votre accord

En acceptant, vous confirmez avoir lu cette charte et accepter que vos pièces soient utilisées **uniquement** pour vérifier votre droit d'exercer. Si vous refusez, votre dossier ne peut pas être vérifié et votre compte reste en attente.

---

## Notes pour la validation (non présentées au professionnel)

- **Base légale** [À CONFIRMER par le juriste] : exécution de mesures précontractuelles à la demande du professionnel, et obligation de vérifier le droit d'exercer avant de le mettre en relation avec des patients.
- **Professionnels européens** : RGPD applicable (transfert hors UE si l'hébergement est au Gabon, ADR-0004).
- **Registre des traitements** : nouveau traitement « vérification des professionnels » à ajouter, et AIPD à évaluer (pièces d'identité).
- **Mise en œuvre** : acceptation enregistrée par le service `documents` (table `chartes_professionnels` : compte, fiche, version, accord ou refus, date) ; la dernière décision fait foi ; aucun dépôt de pièce sans accord sur la version en vigueur.
