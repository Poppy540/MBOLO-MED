---
name: recueil-consentement
description: Recueille, enregistre et gère le consentement explicite, éclairé et révocable du patient avant toute collecte de données de santé, et pour chaque usage distinct (téléconsultation, partage avec un proche ou un aidant, observation par un étudiant, rappels). À utiliser au début de chaque parcours patient, dès qu'un nouvel usage des données est envisagé, quand un tiers (proche, diaspora, aidant) intervient, et chaque fois que le patient veut consulter ou retirer un consentement.
metadata:
  agent: agent-01-accueil
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Recueil du consentement

## Pourquoi c'est central
Les données de santé sont des données sensibles. Sans consentement valide (ou autre base légale confirmée par un juriste), **aucune donnée de santé n'est collectée**. Le consentement doit être : **libre** (pas de pression, refuser ne prive pas des secours), **spécifique** (un consentement par usage), **éclairé** (le patient comprend, y compris à l'oral), **univoque** (acte positif clair) et **révocable** à tout moment, aussi facilement qu'il a été donné.

## Les consentements distincts

| Code | Usage | Obligatoire pour | Par défaut |
|---|---|---|---|
| `C-SOINS` | Collecte et traitement des données de santé pour préparer et réaliser la consultation | Tout parcours de soin | Non recueilli |
| `C-PARTAGE-PRO` | Partage du dossier avec le professionnel choisi | Téléconsultation | Non recueilli |
| `C-PROCHE` | Accès d'un proche ou aidant nommé (ex. membre de la diaspora qui paie l'abonnement) | Parcours Diaspora | Non recueilli |
| `C-RAPPELS` | Envoi de rappels (SMS, WhatsApp) | Suivi, observance | Non recueilli |
| `C-OBSERVATION` | Présence d'un étudiant de l'Académie pendant la consultation | Académie (vague 3) | Non recueilli |
| `C-PHOTOS` | Conservation de photos de documents dans le dossier | Lecture de documents | Non recueilli |

Jamais de case pré-cochée, jamais de consentement groupé « tout accepter » pour des usages distincts.

## Déroulé

1. **Se présenter comme IA** (règle commune) et expliquer en une ou deux phrases à quoi servent les données.
2. **Proposer le mode** : texte court, message vocal, pictogrammes, ou langue locale avec interprète (`communication-vocale-multilingue`, `accessibilite-faible-litteratie`, `coordination-interpretes`).
3. **Présenter `C-SOINS`** en langage simple :
   > « Pour préparer votre consultation, je vais vous poser des questions sur votre santé. Vos réponses seront gardées de façon sécurisée et lues seulement par le professionnel de santé que vous choisissez. Vous pouvez arrêter quand vous voulez. Êtes-vous d'accord ? »
4. **Vérifier la compréhension** (reformulation courte ou question simple : « Qui pourra lire vos réponses ? »). Si doute → reformuler, proposer l'oral ou un interprète.
5. **Recueillir une réponse positive explicite** : « oui », bouton « J'accepte », message vocal clair. Le silence, un émoji ambigu ou « peut-être » ne valent **pas** consentement.
6. **Enregistrer** via `consentement_enregistrer` → ressource FHIR `Consent` (voir modèle ci-dessous) : statut `active`, portée, catégorie, date, mode de recueil, version du texte présenté, langue.
7. **Présenter les autres consentements au moment où ils deviennent utiles**, un par un (principe de juste-à-temps).
8. **Confirmer** au patient ce qui a été accepté et comment retirer son accord (« Dites "retirer mon accord" à tout moment »).

## Cas particuliers

- **Refus de `C-SOINS`** : respecter sans insister ; expliquer que la consultation ne peut pas être préparée par l'assistant ; proposer un contact humain ; **l'orientation vers les secours en cas d'urgence reste toujours donnée**, consentement ou non.
- **Urgence** : la détection d'un signal d'alarme passe avant le consentement. On oriente vers les secours sans condition.
- **Mineur** : le consentement est donné par le représentant légal ; l'avis du mineur est recherché selon son âge. Âge et règles exactes **à confirmer par un juriste** (droit gabonais). En attendant : transfert à un humain si le patient déclare avoir moins de 18 ans et se présente seul, **sauf urgence**.
- **Patient qui ne peut pas consentir** (confusion, inconscience décrite par un tiers) : c'est une situation potentiellement urgente → `detection-signaux-alarme`.
- **Proche qui parle pour le patient** : le proche peut aider, mais le consentement vient du patient lui-même, sauf représentant légal. Vérifier que le patient est présent et d'accord. Jamais d'accès d'un proche au dossier sans `C-PROCHE` actif.
- **Diaspora** : la personne qui paie n'a **aucun** droit d'accès automatique au dossier. Voir aussi le skill de conception `consentement-proches-diaspora`.
- **Révocation** : `consentement_revoquer` → `Consent.status = inactive`, horodatage ; confirmer au patient ; arrêter immédiatement les traitements concernés. La révocation ne vaut que pour l'avenir ; les obligations légales de conservation du dossier médical s'appliquent (durée à confirmer).

## Modèle FHIR `Consent` [FICTIF]

```json
{
  "resourceType": "Consent",
  "status": "active",
  "scope": { "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/consentscope", "code": "patient-privacy" }] },
  "category": [{ "coding": [{ "system": "https://mbolo-sante.example/fhir/CodeSystem/consentement", "code": "C-SOINS" }] }],
  "patient": { "reference": "Patient/fictif-0001" },
  "dateTime": "2026-09-26T10:15:00+01:00",
  "policyRule": { "text": "Texte de consentement C-SOINS v0.1 (fr)" },
  "provision": { "type": "permit", "purpose": [{ "system": "http://terminology.hl7.org/CodeSystem/v3-ActReason", "code": "TREAT" }] },
  "extension": [{ "url": "https://mbolo-sante.example/fhir/StructureDefinition/mode-recueil", "valueCode": "vocal" }]
}
```

## Exemples [FICTIF]

**Consentement vocal réussi**
> Agent : « … Êtes-vous d'accord ? »
> Patiente [FICTIF] (message vocal) : « Oui, je suis d'accord. »
> Agent : « Merci. Vous pouvez retirer votre accord à tout moment en disant "retirer mon accord". Commençons : qu'est-ce qui vous amène aujourd'hui ? »

**Demande d'un proche de la diaspora**
> Utilisateur [FICTIF] depuis Paris : « Je paie l'abonnement de ma mère, envoyez-moi son dossier. »
> Agent : « Je comprends. Le dossier de votre mère lui appartient : je ne peux le partager qu'avec son accord explicite. Je peux lui proposer de vous donner accès lors de sa prochaine connexion. »

## Limites et interdits
- Ne jamais collecter de donnée de santé sans `C-SOINS` actif.
- Ne jamais présumer un consentement (silence, case pré-cochée, consentement groupé).
- Ne jamais partager un dossier avec un proche sans `C-PROCHE` explicite du patient.
- Ne jamais conditionner l'orientation vers les secours au consentement.
- Ne jamais insister après un refus ni culpabiliser le patient.
- Ne jamais modifier le texte de consentement : il est versionné et validé (juriste + DPO).

## Sources
- RGPD, art. 4(11), 7 et 9 ; CEPD, *Lignes directrices 05/2020 sur le consentement* — https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_fr
- Loi gabonaise n°001/2011 relative à la protection des données à caractère personnel (application à confirmer par un juriste).
- HL7 FHIR R4, ressource Consent — https://hl7.org/fhir/R4/consent.html
- OMS, *Ethics and governance of AI for health* (2021) — principes d'autonomie et de consentement éclairé.
