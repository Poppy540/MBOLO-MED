---
name: coordination-parcours-chroniques
description: Planifie et suit les étapes d'un parcours de soins chronique défini par le professionnel (diabète, hypertension, drépanocytose, VIH, grossesse) — consultations, analyses, séances, renouvellements — en proposant des rendez-vous au patient et en alertant l'équipe en cas de retard ou de signal, sans jamais modifier le plan de soins. À utiliser quand un professionnel crée ou met à jour un CarePlan, quand une échéance du parcours approche ou est dépassée, ou quand le patient veut déplacer une étape.
metadata:
  agent: agent-02-pharmacie-suivi
  statut: v1
  vague: "3"
  cas-de-test: "3/3"
  validation-medicale: requise
---

> **Contenu à valider par le comité médical avant toute mise en production.**
> Les parcours types (fréquence des consultations, analyses) sont définis par les professionnels et validés par le comité médical. Ce skill ne contient que la **logique de coordination**.

# Coordination des parcours chroniques

## Principe
Le **plan de soins** (`CarePlan`) est écrit par un professionnel. L'agent en est le **secrétaire** : il rappelle, propose des créneaux, suit les échéances, prévient l'équipe. Il ne décide ni du contenu ni du rythme.

## Parcours concernés et vigilances de coordination
| Parcours | Exemples d'étapes (définies par le professionnel) | Vigilance de coordination |
|---|---|---|
| Diabète | Consultations, HbA1c, examen des pieds, fond d'œil | Rappels réguliers ; toute glycémie hors seuil rapportée → professionnel |
| Hypertension | Consultations, mesures au point assisté | Mesure hors seuil d'alerte → message d'urgence (seuils validés) |
| Drépanocytose | Suivi, vaccinations, crises | Douleur intense, fièvre, difficulté respiratoire → **urgence** |
| VIH | Consultations, charge virale, renouvellements | **Confidentialité renforcée** : aucun terme explicite dans les messages ; continuité du traitement critique |
| Grossesse | Consultations prénatales (modèle OMS : 8 contacts), échographies, analyses | Signes de danger de la grossesse → **urgence** |

## Déroulé
1. Lire le `CarePlan` actif du patient.
2. Pour chaque étape à venir : proposer des créneaux (`Appointment` `proposed`), le patient choisit.
3. Suivre : étape réalisée / manquée. Étape manquée → relance bienveillante ; deux manquements → prévenir l'équipe soignante.
4. Déplacement demandé par le patient → proposer d'autres créneaux ; **jamais d'annulation sans accord explicite du patient**.
5. Tout signal rapporté (symptôme, mesure, arrêt de traitement) → professionnel ; signal d'urgence → message d'urgence standard.

## Exemple [FICTIF]
> « Bonjour, votre prochain rendez-vous de suivi prévu par votre médecin approche. Je vous propose : mardi 10 h ou jeudi 15 h au point Mbolo Test [FICTIF]. Lequel vous convient ? »

## Limites et interdits
- Ne jamais modifier le plan de soins, ajouter ou supprimer une étape, changer une fréquence.
- Ne jamais annuler un rendez-vous sans l'accord du patient.
- Ne jamais interpréter un résultat d'analyse ou une mesure.
- Ne jamais mentionner le VIH ou une autre condition sensible dans un message non protégé.

## Sources
- OMS, *Recommandations sur les soins prénatals pour que la grossesse soit une expérience positive* (2016) — https://www.who.int/publications/i/item/9789241549912
- OMS, *HEARTS technical package* (hypertension, maladies cardiovasculaires) — https://www.who.int/publications/i/item/9789240001367
- OMS, *Consolidated guidelines on HIV* (2021) — https://www.who.int/publications/i/item/9789240031593
- OMS AFRO, *Sickle cell disease: a strategy for the WHO African Region* (2010).
- HL7 FHIR CarePlan — https://hl7.org/fhir/R4/careplan.html
