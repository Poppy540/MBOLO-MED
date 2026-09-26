---
name: signalement-pharmacovigilance
description: Recueille de façon structurée un effet indésirable rapporté par un patient ou une pharmacie, le transmet au professionnel concerné et prépare la déclaration au circuit de pharmacovigilance, sans jamais en évaluer la gravité ni l'imputabilité. À utiliser dès qu'un patient signale un effet inattendu ou gênant après la prise d'un médicament ou d'un vaccin, ou qu'une pharmacie signale un problème de qualité d'un produit.
metadata:
  agent: agent-02-pharmacie-suivi
  statut: v1
  vague: "2"
  cas-de-test: "1/3"
---

> **Version 1** — circuit national de pharmacovigilance du Gabon et interlocuteur à confirmer.

# Signalement de pharmacovigilance

## Principe
**Tout** effet rapporté est transmis. L'évaluation (gravité, lien avec le médicament) est faite par des professionnels. L'agent ne filtre pas.

## Déroulé
1. **Urgence d'abord** : gonflement du visage ou de la gorge, difficulté à respirer, éruption étendue avec bulles, malaise → message d'urgence standard + transfert immédiat.
2. Recueillir les éléments minimaux d'un signalement (critères OMS / ICH E2B) : patient identifiable (dans le dossier), médicament suspecté (nom, dosage, lot si disponible — photo de la boîte), effet décrit avec les mots du patient, date de début, évolution, autres médicaments et remèdes traditionnels, déclarant.
3. Créer un `AdverseEvent` en **brouillon** (non confirmé) ; transmettre au professionnel prescripteur (`pharmacovigilance_signaler`).
4. Préparer la déclaration au circuit national, **validée et envoyée par un professionnel** selon la procédure retenue.
5. Dire au patient : « Merci de l'avoir signalé. Votre médecin est prévenu. Ne changez pas votre traitement sans son avis, sauf si c'est une urgence. »

## Exemple [FICTIF]
> Patient [FICTIF] : « Depuis le nouveau médicament, j'ai des plaques rouges qui grattent sur les bras. »
> Agent : « Avez-vous du mal à respirer ou le visage qui gonfle, oui ou non ? » → « Non. » → recueil structuré → transmission au médecin.

## Limites et interdits
- Ne jamais évaluer la gravité ni l'imputabilité, ni dire « ce n'est pas lié au médicament ».
- Ne jamais conseiller d'arrêter ou de continuer le traitement (sauf message d'urgence standard).
- Ne jamais filtrer un signalement jugé « mineur ».

## Sources
- OMS, *The safety of medicines in public health programmes: pharmacovigilance an essential tool* (2006) — https://www.who.int/publications/i/item/9241593911
- ICH E2B(R3) — éléments de données des rapports de cas individuels.
- Uppsala Monitoring Centre (centre collaborateur OMS) — https://who-umc.org/
- HL7 FHIR AdverseEvent — https://hl7.org/fhir/R4/adverseevent.html
