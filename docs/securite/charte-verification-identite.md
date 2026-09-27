# Charte de vérification d'identité — BROUILLON v0.1

> **Brouillon à valider par le porteur de projet et le juriste avant toute utilisation.** Ce texte n'est pas en vigueur. Les passages entre crochets `[À COMPLÉTER]` ou `[À CONFIRMER]` attendent une décision ou l'avis juridique (ADR-0014, hypothèses de `memory.md`).
>
> Rédigé pour être **lu à voix haute** (faible littératie, lecture vocale prévue) : phrases courtes, un sujet par paragraphe. La version affichée au patient reprend la partie « Texte présenté au patient » uniquement.

---

## Texte présenté au patient

### Pourquoi nous vérifions votre identité

Un médecin doit savoir qui il soigne. Avant votre première consultation, Mbolo Santé vérifie donc que vous êtes bien la personne inscrite. Cela protège votre dossier médical : personne d'autre ne peut consulter à votre place.

### Ce que nous vous demandons

Deux photos, prises avec votre téléphone ou par un professionnel de santé :

1. **votre document** : votre pièce d'identité avec votre numéro d'assurance maladie (au Gabon : CNAMGS), ou, si vous n'en avez pas, votre acte de naissance ;
2. **votre visage**, pour comparer avec le document.

### Qui regarde vos photos

Seulement **une personne de l'équipe Mbolo Santé**, spécialement habilitée pour cela. Elle se connecte avec une double sécurité, et chaque consultation des photos est enregistrée : on sait qui a regardé, et quand.

**Aucun programme informatique ni intelligence artificielle ne décide à sa place.** C'est toujours un humain qui confirme votre identité. [À CONFIRMER : aucune reconnaissance faciale automatique.]

Votre médecin ne voit pas vos photos. Il sait seulement que votre identité a été vérifiée.

### Où sont gardées vos photos, et combien de temps

Vos photos sont gardées **chiffrées** (illisibles sans clé), chez notre hébergeur de données de santé [À CONFIRMER : nom et pays, ADR-0004].

Nous les gardons **comme preuve** de la vérification, pendant [À CONFIRMER par l'avis juridique : durée]. Ensuite, elles sont supprimées. Nous gardons seulement le résultat : identité vérifiée, par qui, et à quelle date.

### Ce que nous ne faisons jamais

- Nous ne vendons pas vos photos ni vos informations.
- Nous ne les utilisons pas pour de la publicité.
- Nous ne les donnons à personne d'autre, sauf si la loi nous y oblige.

### Si un proche vous aide

Un proche peut vous aider à remplir le formulaire ou à prendre les photos. Mais **c'est vous qui acceptez cette charte**, et vous devez être présent. Votre compte et votre dossier restent à votre nom.

[À CONFIRMER : cas des mineurs et des personnes sous tutelle — qui accepte, avec quel document.]

### Vos droits

Vous pouvez à tout moment :

- **voir** les informations que nous avons sur vous ;
- **les faire corriger** si elles sont fausses ;
- **demander leur suppression**. Attention : sans identité vérifiée, vous ne pourrez plus consulter. Et la preuve de vérification peut devoir être gardée le temps fixé par la loi [À CONFIRMER] ;
- **retirer votre accord**. Vous ne pourrez alors plus consulter tant qu'une nouvelle vérification n'a pas été faite.

Pour cela, contactez [À COMPLÉTER : responsable de la protection des données, téléphone et adresse].

Vous pouvez aussi vous adresser à l'autorité de protection des données personnelles : au Gabon, la CNPDCP [À CONFIRMER : coordonnées]. [À CONFIRMER : pour les personnes résidant dans l'Union européenne, l'autorité de leur pays, au titre du RGPD.]

### Votre accord

☐ J'ai lu (ou on m'a lu) cette charte. J'accepte que Mbolo Santé prenne et garde une photo de mon document et de mon visage pour vérifier mon identité.

**[J'accepte]**  **[Je refuse]**

Si vous refusez, vous gardez votre compte, mais vous ne pourrez pas consulter : un professionnel de santé peut vous proposer une vérification en personne [À CONFIRMER].

*Charte de vérification d'identité, version 0.1 du [À COMPLÉTER : date de validation].*

---

## Notes pour le porteur de projet et le juriste (non présentées au patient)

### Points à valider

1. **Base légale** du traitement des photos : consentement explicite, ou obligation légale d'identifier le patient ? L'identification pourrait être obligatoire pour la téléconsultation ou pour les ordonnances : dans ce cas, le « Je refuse » n'offre pas d'alternative à distance. À préciser (hypothèse « identification des patients » de `memory.md`).
2. **Durée de conservation** des photos, et durée de conservation de la trace de vérification (qui, quand, résultat).
3. **Reconnaissance faciale automatique** : proposition de l'**exclure** (donnée biométrique, risque élevé, principe « l'humain décide »). La comparaison est faite à l'œil par la personne habilitée.
4. **Mineurs et majeurs protégés** : qui accepte la charte, quels documents (livret de famille, jugement de tutelle…).
5. **Hébergement** des photos : même hébergeur que le dossier (ADR-0004), dans le pays exigé par la loi.
6. **Responsable du traitement, DPO, coordonnées** de la CNPDCP ; formalités préalables auprès de la CNPDCP (loi n°001/2011) pour un traitement de données de santé et d'identité.
7. **Numéro provisoire Mbolo** (patients sans CNAMGS) : format, qui l'attribue, et ce qui se passe quand le patient obtient ensuite un numéro CNAMGS.
8. **Langues** : traduction et lecture vocale en langues locales, relues par un locuteur du pays.

### Ce que la plateforme devra faire (ADR-0014)

- **Afficher la charte avant l'envoi des photos**, et enregistrer l'acceptation : version, date, et compte (identifiant opaque).
- **Refuser toute photo sans acceptation** de la version en vigueur. Une nouvelle version exige une nouvelle acceptation.
- **Stocker les photos dans le stockage chiffré** (`STORAGE_*`), jamais dans la base des services, dans un jeton ni dans un journal.
- **Tracer chaque consultation** des photos et chaque décision de la personne habilitée (rôle `verification-identite`, double authentification).
- **Supprimer automatiquement** les photos à la fin de la durée fixée.

Sources : ADR-0014 ; `docs/securite/registre-traitements.md` (T9) ; principes n°1, n°3, n°6 et n°7 de `CLAUDE.md` ; loi gabonaise n°001/2011 relative à la protection des données à caractère personnel ; RGPD (règlement UE 2016/679), articles 6, 9 et 13.
