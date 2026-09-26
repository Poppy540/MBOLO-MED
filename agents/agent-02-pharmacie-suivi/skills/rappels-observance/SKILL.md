---
name: rappels-observance
description: Programme et envoie, avec le consentement du patient (C-RAPPELS), des rappels de prise de médicaments et de rendez-vous fidèles à l'ordonnance, adaptés au faible débit (SMS, WhatsApp, vocal), et recueille sans jugement les difficultés d'observance pour les transmettre au professionnel. À utiliser après la délivrance d'une ordonnance, lors d'un parcours chronique, ou quand le patient demande de l'aide pour ne pas oublier.
metadata:
  agent: agent-02-pharmacie-suivi
  statut: v1
  vague: "2"
  cas-de-test: "1/3"
---

> **Version 1** — gabarits de messages à valider (confidentialité sur téléphone partagé).

# Rappels d'observance

## Déroulé
1. Vérifier `C-RAPPELS` ; sinon le proposer (skill `recueil-consentement` de l'Agent 1).
2. Construire le calendrier **exactement** à partir de la posologie de l'ordonnance signée (heures choisies par le patient dans la fenêtre prévue).
3. **Discrétion** : messages neutres par défaut (téléphones partagés) — « Rappel Mbolo : c'est l'heure de votre traitement » — sans nom de médicament ni de maladie, sauf si le patient le demande.
4. Recueillir la réponse (« pris / pas pris / problème ») ; ne jamais faire de reproche.
5. Difficulté signalée (oubli répété, effet gênant, arrêt volontaire, coût) → **transmettre au professionnel** ; si effet indésirable → `signalement-pharmacovigilance` ; si signal d'urgence → message d'urgence.
6. Arrêter les rappels à la fin du traitement ou sur simple demande.

## Exemple [FICTIF]
> SMS 08:00 : « Rappel Mbolo : c'est l'heure de votre traitement du matin. Répondez 1 si c'est fait, 2 si vous avez un souci. »
> Patient : « 2 — ça me donne des nausées, je veux arrêter. »
> Agent : « Merci de me le dire. Je préviens votre médecin, qui vous recontactera. Ne changez rien sans son avis. »

## Limites et interdits
- Ne jamais modifier une posologie, une heure de prise hors fenêtre prescrite, ou conseiller d'arrêter ou de reprendre un traitement.
- Ne jamais mentionner une maladie ou un médicament dans un rappel sans accord du patient.
- Ne jamais culpabiliser le patient.

## Sources
- OMS, *Adherence to long-term therapies: evidence for action* (2003) — https://iris.who.int/handle/10665/42682
- OMS, *Recommendations on digital interventions for health system strengthening* (2019) — messages ciblés aux patients.
