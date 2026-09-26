---
name: resume-pre-consultation
description: Rédige pour le seul professionnel choisi par le patient un résumé pré-consultation concis, factuel et structuré (motif, histoire, antécédents, traitements dont remèdes traditionnels, allergies, grossesse, mesures, documents, catégorie de triage, questions du patient), clairement marqué comme préparé par une IA et non validé. À utiliser à la fin de l'accueil, une fois l'orientation choisie, et pour mettre à jour le résumé si le patient ajoute une information avant la consultation.
metadata:
  agent: agent-01-accueil
  statut: v1
  vague: "1"
  cas-de-test: "1/3"
---

> **Version 1** — format à valider avec des médecins utilisateurs (lisible en moins d'une minute).

# Résumé pré-consultation

## Format (une page, lisible en moins d'une minute)
```
RÉSUMÉ PRÉPARÉ PAR L'ASSISTANT IA — informations déclarées par le patient, non vérifiées
Patient : <prénom, âge, sexe> · Langue : <…> · Mode : vidéo / audio / point assisté
Triage : catégorie <…> (protocole v<…>) · Signaux d'alarme recherchés : aucun déclaré
Motif (mots du patient) : « … »
Histoire : début …, évolution …, intensité …/10, signes associés …
Antécédents déclarés : …
Traitements déclarés : … · Remèdes traditionnels : …
Allergies déclarées : …
Grossesse / allaitement : …
Mesures (point assisté, validées par l'infirmier) : …
Documents fournis : <liste, lecture incertaine signalée>
Questions du patient : …
Points à clarifier : <incohérences, réponses « je ne sais pas »>
```

## Règles
- **Faits déclarés uniquement**, avec les mots du patient entre guillemets quand c'est utile.
- Aucune hypothèse diagnostique, aucune suggestion d'examen ou de traitement.
- Signaler clairement les incertitudes et les incohérences.
- Destinataire : **uniquement** le professionnel choisi (`Encounter.participant`). Jamais un proche, un autre professionnel ou un service externe.
- Stocké dans le dossier FHIR (`Composition` ou `DocumentReference`) avec `Provenance` « agent IA ».

## Exemple [FICTIF]
```
RÉSUMÉ PRÉPARÉ PAR L'ASSISTANT IA — informations déclarées, non vérifiées
Patiente : Test C [FICTIF], 34 ans, F · Français · Vidéo
Triage : vert (protocole v0-FICTIF) · Aucun signal d'alarme déclaré
Motif : « je tousse depuis une semaine »
Histoire : début il y a ~7 j, stable, pas de difficulté respiratoire, pas de fièvre mesurée
Antécédents : aucun déclaré · Traitements : sirop (nom inconnu) · Remèdes : tisane de citronnelle
Allergies : aucune connue · Grossesse : non
Questions : « Est-ce que je peux continuer à travailler ? »
```

## Limites et interdits
- Ne jamais transmettre le résumé à quelqu'un d'autre que le professionnel choisi.
- Ne jamais y inclure un diagnostic, une hypothèse ou une recommandation de traitement.
- Ne jamais présenter le résumé comme validé par un professionnel.

## Sources
- Méthode SBAR (Situation, Background, Assessment, Recommendation) — Institute for Healthcare Improvement ; ici sans la partie « Assessment/Recommendation » réservée au professionnel.
- HL7 FHIR International Patient Summary — https://hl7.org/fhir/uv/ips/
