# Violation de données : informer l'autorité et les patients — BROUILLON v0.1

> **Brouillon préparé par l'Agent 6 le 2026-11-19, à valider par le juriste (ou le DPO) et le porteur de projet avant tout usage.**
>
> - Écart E6 de l'[exercice sur table n°1](exercice-sur-table-01.md) : aucun gabarit pour informer les patients d'une violation de données.
> - Rien n'est envoyé automatiquement. **Un humain décide** de notifier (responsable sécurité, avec le juriste ou le DPO) et **un humain envoie**. Un agent IA peut préparer un brouillon, jamais l'envoyer (principe n°7).
> - Les délais et l'autorité compétente au Gabon restent à confirmer par le juriste (D-0003, question 1 de `memory.md`). Tout ce qui est marqué `[À VALIDER]` ou `[À COMPLÉTER]` l'est encore.

## 1. Quand informer, et qui décide

| Étape | Qui | Repère |
|---|---|---|
| Qualifier la violation : quelles données, combien de patients, quel risque | Responsable sécurité, avec le juriste ou le DPO | Plan d'incident, étapes 1 à 4 ; traces du compte (`GET /securite/traces-compte`) ; contestations (`GET /securite/contestations`) |
| Notifier l'**autorité** de protection des données | Juriste ou DPO, après décision du porteur de projet | RGPD art. 33 : 72 h après la prise de connaissance, si la violation touche des personnes dans l'UE. Gabon (CNPDCP, loi n°001/2011) : délai `[À VALIDER]` |
| Informer les **patients** | Responsable sécurité, après accord du juriste | RGPD art. 34 : sans délai si le risque est élevé. Des **données de santé** lues par un tiers sont en principe un risque élevé `[À VALIDER]` |
| Consigner la décision, même de ne pas notifier | Responsable sécurité | Journal d'incident (`control-room/incidents/INC-AAAA-NNN.md`) ; RGPD art. 33.5 |

Ne pas attendre d'avoir tout compris pour notifier l'autorité : une notification peut être complétée ensuite (RGPD art. 33.4).

## 2. SMS au patient (premier contact)

Texte court, sans donnée de santé, sans nom de professionnel, sans lien cliquable : un SMS contenant un lien ressemblerait à une tentative d'hameçonnage, qui suit souvent une fuite.

> Mbolo Santé : un incident de sécurité a pu toucher votre dossier. L'équipe va vous appeler. Ne donnez jamais votre code à personne.

- Texte au catalogue du service `notifications` (`CATALOGUE_INFORMATION_VIOLATION`) : un test vérifie qu'il tient en un SMS (160 caractères) et ne contient ni variable ni donnée de santé.
- **Aucune route ne l'envoie encore.** L'envoi sera branché après la validation du juriste : une personne du rôle `responsable-securite` le déclenchera, dossier par dossier, sous un flag désactivé par défaut.
- Envoyé au numéro du dossier, même sans consentement `C-RAPPELS` : c'est une information obligatoire, pas un rappel `[À VALIDER]`.
- L'équipe `assistance-patient` rappelle ensuite chaque patient, avec la procédure de rappel au numéro du dossier, et lui lit ou lui remet la lettre ci-dessous.

## 3. Lettre au patient (information complète, RGPD art. 34)

Remise par l'équipe (lecture au téléphone, puis courrier ou écran de l'application). Mots simples ; lue à voix haute si besoin ; traduite par un humain dans la langue du patient.

> **Objet : incident de sécurité concernant votre dossier Mbolo Santé**
>
> Madame, Monsieur,
>
> Le `[date]`, nous avons découvert qu'une personne non autorisée a pu `[consulter / copier]` des informations de votre dossier Mbolo Santé. Nous vous écrivons pour vous l'expliquer et vous dire ce que nous faisons.
>
> **Ce qui s'est passé.** `[Une phrase simple : par exemple, le compte d'un professionnel a été utilisé par quelqu'un d'autre entre le … et le ….]`
>
> **Les informations concernées.** `[Liste précise : par exemple, votre nom, votre date de naissance, le compte-rendu de votre consultation du ….]` `[Ce qui n'a pas été touché : par exemple, vos photos d'identité, vos paiements.]`
>
> **Ce que nous avons fait.** Nous avons coupé l'accès en cause le `[date]`, vérifié toutes les traces des accès à votre dossier, et `[informé l'autorité de protection des données le …]`.
>
> **Ce que vous pouvez faire.**
> - Ne donnez jamais votre code de connexion, même à quelqu'un qui dit appeler de la part de Mbolo Santé.
> - Méfiez-vous des messages ou appels qui citent votre santé pour vous demander de l'argent ou un code.
> - Regardez « Mes partages et accès » dans l'application. Si vous ne reconnaissez pas un accès, touchez « Je ne reconnais pas cet accès ».
> - `[Autre mesure selon l'incident.]`
>
> **Les conséquences possibles.** `[Par exemple : risque que ces informations soient utilisées pour vous tromper ou vous faire pression.]`
>
> **Pour toute question.** Appelez l'équipe Mbolo Santé au `[numéro de l'équipe]`. Vous pouvez aussi écrire au délégué à la protection des données : `[coordonnées du DPO]`. Vous avez le droit de saisir l'autorité de protection des données : `[CNPDCP, coordonnées]`.
>
> Nous vous prions de nous excuser.
>
> `[Nom et fonction du responsable du traitement]`

## 4. Notification à l'autorité (RGPD art. 33.3)

À remplir par le juriste ou le DPO, avec les éléments du journal d'incident :

| Rubrique | Contenu | Source |
|---|---|---|
| Nature de la violation | Confidentialité, intégrité ou disponibilité ; ce qui s'est passé | Journal d'incident |
| Catégories et nombre approximatif de personnes | Patients, proches, professionnels | `dossiersAccordes` des traces du compte ; contestations |
| Catégories et nombre approximatif d'enregistrements | Dossiers lus, documents ouverts | Traces `AuditEvent` |
| Coordonnées du DPO ou d'un contact | `[À COMPLÉTER]` | — |
| Conséquences probables | Pour les personnes concernées | Analyse du responsable sécurité et du juriste |
| Mesures prises ou proposées | Coupure du compte, marque « compte coupé », retrait des salles, rétablissement | Plan d'incident |
| Information des personnes | Faite, prévue, ou motif de ne pas la faire | Décision consignée |

## 5. Ce qui reste à décider

1. Le juriste valide ou corrige le SMS et la lettre, et dit si l'information des patients doit être faite dans tous les cas où des données de santé ont été lues.
2. Délai et autorité compétente au Gabon (CNPDCP) ; délai si le RGPD s'applique (patients de la diaspora, professionnels dans l'UE).
3. Numéro de l'équipe et coordonnées du DPO à indiquer.
4. Qui signe la lettre (responsable du traitement).
5. Branchement de l'envoi du SMS : rôle `responsable-securite`, un dossier à la fois, flag désactivé par défaut, envoi tracé.

## Sources

- [Plan d'incident](plan-incident.md) ; [exercice sur table n°1](exercice-sur-table-01.md) ; [AIPD n°2](aipd-teleconsultation.md).
- RGPD, articles 33 et 34 ; CEPD, lignes directrices 9/2022 sur la notification des violations de données et 01/2021 (exemples) ; loi gabonaise n°001/2011 relative à la protection des données à caractère personnel `[articles à préciser par le juriste]`.
