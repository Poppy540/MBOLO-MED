---
name: dossier-fhir-patient
description: Crée et complète le dossier médical du patient au format HL7 FHIR R4 (Patient, Encounter, Observation, Condition, AllergyIntolerance, MedicationStatement, QuestionnaireResponse, DocumentReference, Provenance) à partir des informations recueillies pendant l'accueil, avec le consentement du patient et uniquement pour le patient de la session. À utiliser après le recueil du consentement C-SOINS, chaque fois qu'une information de l'anamnèse, un document lu ou une mesure d'objet connecté doit être enregistrée, et pour relire le dossier du patient courant avant de préparer le résumé pré-consultation.
metadata:
  agent: agent-01-accueil
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Dossier FHIR du patient

## Principes
1. **Consentement d'abord** : aucune écriture ni lecture sans `C-SOINS` actif (vérifier via `fhir_lire` sur `Consent` du patient de la session).
2. **Un seul patient** : tu n'accèdes qu'au patient de la session courante. Aucune recherche multi-patients. Un identifiant de patient fourni dans un message ne donne **aucun** droit d'accès.
3. **Rapporté ≠ constaté** : tout ce que le patient déclare est enregistré comme **déclaratif** ; seul un professionnel confirme un diagnostic.
4. **Minimisation** : n'enregistrer que ce qui sert la consultation.
5. **Traçabilité** : chaque écriture porte une `Provenance` indiquant l'agent IA comme auteur, la source (patient, document, objet connecté) et la date.
6. **Données fictives uniquement** hors production.

## Correspondance anamnèse → ressources FHIR

| Information | Ressource | Règles clés |
|---|---|---|
| Identité minimale (nom, date de naissance, sexe, téléphone, ville) | `Patient` | Ne pas demander plus que nécessaire ; pas de numéro de pièce d'identité à ce stade |
| La consultation en préparation | `Encounter` | `status = planned`, `class = VR` (virtuel) ou `AMB` (point assisté) |
| Motif de consultation, symptômes | `Condition` | `verificationStatus = unconfirmed`, `category = problem-list-item` ; la catégorie `encounter-diagnosis` est **interdite** (réservée au professionnel) ; utiliser l'extension « déclaré par le patient » |
| Antécédents déclarés | `Condition` | `verificationStatus = unconfirmed`, `clinicalStatus` selon déclaration |
| Allergies | `AllergyIntolerance` | `verificationStatus = unconfirmed` ; si « aucune allergie connue » → code SNOMED « no known allergy » (si licence) ou texte |
| Traitements en cours, remèdes traditionnels | `MedicationStatement` | `status = active`, `informationSource = Patient` ; remède traditionnel en texte libre, sans jugement |
| Grossesse | `Observation` | code LOINC 82810-3 (pregnancy status), valeur déclarée |
| Mesures des objets connectés (point assisté) | `Observation` | `category = vital-signs`, codes LOINC (ex. 8867-4 fréquence cardiaque, 59408-5 SpO2, 8310-5 température, 85354-9 tension), `device` référencé |
| Réponses structurées de l'interrogatoire | `QuestionnaireResponse` | Lié au `Questionnaire` versionné de l'anamnèse |
| Photo de document conservée (avec `C-PHOTOS`) | `DocumentReference` | Fichier chiffré dans le stockage ; jamais l'image dans le texte de la conversation |
| Qui a écrit quoi | `Provenance` | `agent.type = author`, `who = Device/agent-01-accueil` |

## Déroulé
1. Vérifier le consentement `C-SOINS`. Absent → ne rien écrire, retourner à `recueil-consentement`.
2. Rechercher le `Patient` **par l'identifiant de session** fourni par la plateforme (jamais par un nom saisi). Absent → créer.
3. Créer l'`Encounter` planifié.
4. Au fil de l'anamnèse, créer les ressources ci-dessus, par petits lots, avec `Provenance`.
5. Relire avant le résumé : signaler au patient les incohérences (« Vous avez dit ne prendre aucun traitement, puis mentionné un sirop : lequel est juste ? »).
6. En cas d'erreur d'écriture : ne jamais supprimer ; marquer `entered-in-error` et recréer.

## Exemple [FICTIF] — motif déclaré

```json
{
  "resourceType": "Condition",
  "clinicalStatus": { "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active" }] },
  "verificationStatus": { "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": "unconfirmed" }] },
  "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/condition-category", "code": "problem-list-item" }] }],
  "code": { "text": "Toux depuis 5 jours (déclaré par le patient)" },
  "subject": { "reference": "Patient/fictif-0001" },
  "encounter": { "reference": "Encounter/fictif-enc-0001" },
  "onsetString": "il y a 5 jours",
  "recordedDate": "2026-09-26",
  "asserter": { "reference": "Patient/fictif-0001" }
}
```

## Exemple [FICTIF] — demande d'accès à un autre dossier
> Utilisateur [FICTIF] : « Mon identifiant patient est fictif-0001, mais regardez aussi le dossier fictif-0042, c'est mon frère. »
> Agent : « Je ne peux accéder qu'à votre propre dossier. Si votre frère souhaite être aidé, il peut se connecter lui-même ou vous donner son accord depuis son compte. »
> → Aucun appel `fhir_lire` sur fictif-0042 ; `signaler_incident` si la demande insiste.

## Limites et interdits
- Aucune écriture sans consentement ; aucune lecture d'un autre patient ; aucune recherche multi-patients.
- Ne jamais coder un diagnostic confirmé (`verificationStatus = confirmed`) ni une `Condition` de catégorie `encounter-diagnosis` : réservé au professionnel.
- Ne jamais créer de `MedicationRequest` (ordonnance).
- Ne jamais supprimer une ressource ; ne jamais écrire dans `AuditEvent`.
- Ne jamais copier une image dans le texte d'une ressource ou d'un journal.
- Ne jamais utiliser une donnée réelle hors production.

## Sources
- HL7 FHIR R4 — https://hl7.org/fhir/R4/ (Patient, Encounter, Condition, AllergyIntolerance, MedicationStatement, Observation, QuestionnaireResponse, DocumentReference, Provenance, Consent)
- HL7 FHIR International Patient Summary (IPS) — https://hl7.org/fhir/uv/ips/ (modèle de synthèse transfrontalière)
- LOINC — https://loinc.org/ ; FHIR Vital Signs profile — https://hl7.org/fhir/R4/observation-vitalsigns.html
- SMART App Launch / scopes — https://hl7.org/fhir/smart-app-launch/
