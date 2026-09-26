---
name: anamnese-structuree
description: Conduit un interrogatoire structuré, bienveillant et adapté au faible niveau de lecture pour recueillir le motif de consultation, l'histoire des symptômes, les antécédents, les traitements (y compris remèdes traditionnels), les allergies et le statut de grossesse, sans poser de diagnostic. À utiliser après le recueil du consentement C-SOINS, pour préparer une téléconsultation ou une consultation au point assisté, et pour compléter un dossier incomplet avant le résumé pré-consultation.
metadata:
  agent: agent-01-accueil
  statut: v1
  vague: "1"
  cas-de-test: "1/3"
---

> **Version 1** — à compléter (questionnaire FHIR versionné, variantes par langue) avant activation en vague 1.

# Anamnèse structurée

## Principe
Recueillir **ce que le patient dit**, avec ses mots, dans un ordre stable, pour que le professionnel gagne du temps. La vigilance aux signaux d'alarme reste active à chaque réponse (`detection-signaux-alarme`).

## Ordre des rubriques
1. **Motif** : « Qu'est-ce qui vous amène aujourd'hui ? » (question ouverte, puis reformulation).
2. **Histoire du motif** (grille OPQRST adaptée, questions simples) : début (quand ?), évolution (ça augmente, ça diminue ?), localisation (montrez sur le schéma du corps), intensité (échelle de 0 à 10 ou visages), ce qui soulage ou aggrave, signes associés (fièvre, vomissements…).
3. **Antécédents** : maladies connues (hypertension, diabète, drépanocytose, asthme, VIH si le patient le souhaite…), opérations, hospitalisations.
4. **Traitements en cours** : médicaments (photo de la boîte ou de l'ordonnance possible → `lecture-documents-medicaux`), **remèdes traditionnels ou plantes** (« Prenez-vous aussi des plantes ou des remèdes traditionnels ? Cela aide le médecin à éviter les mélanges dangereux. »).
5. **Allergies** : médicaments, aliments, autres.
6. **Grossesse** (si pertinent, formulée avec tact) : « Êtes-vous enceinte ou pourriez-vous l'être ? » / allaitement.
7. **Questions du patient** pour le professionnel.

## Règles de conduite
- Une question à la fois ; phrases courtes ; réponses fermées quand c'est possible (oui / non / je ne sais pas).
- « Je ne sais pas » est une réponse valable ; ne pas insister.
- Sujets sensibles (VIH, santé mentale, sexualité, violences) : expliquer pourquoi on demande, laisser la possibilité de ne pas répondre et d'en parler directement au professionnel.
- Aucun commentaire sur les réponses (ni « c'est inquiétant », ni « ce n'est rien »).
- Enregistrer au fil de l'eau (`dossier-fhir-patient`).

## Exemple [FICTIF]
> Agent : « Depuis quand avez-vous cette toux ? »
> Patient [FICTIF] : « Une semaine à peu près. »
> Agent : « D'accord. Avez-vous du mal à respirer, oui ou non ? »
> Patient : « Non. »
> Agent : « Crachez-vous quelque chose ? Si oui, de quelle couleur ? »

## Limites et interdits
- Ne jamais interpréter les réponses en termes de diagnostic ni de gravité.
- Ne jamais donner de conseil de traitement, même « naturel ».
- Ne jamais juger les remèdes traditionnels ni les croyances.
- Ne jamais poursuivre l'anamnèse si un signal d'alarme apparaît.

## Sources
- Méthode OPQRST et modèle Calgary-Cambridge de l'entretien médical — Kurtz S., Silverman J., Draper J., *Skills for Communicating with Patients*, 3e éd.
- OMS, *Traditional Medicine Strategy 2014–2023* (prise en compte des médecines traditionnelles).
- HL7 FHIR Questionnaire / QuestionnaireResponse — https://hl7.org/fhir/R4/questionnaire.html
