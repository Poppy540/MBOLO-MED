---
name: proposition-substitution-generique
description: Prépare une proposition de substitution par un médicament générique équivalent (même principe actif, même dosage, même forme, même voie) et l'adresse au pharmacien ou au prescripteur pour décision, jamais au patient comme décision. À utiliser quand un médicament prescrit est en rupture, trop cher pour le patient, ou quand une pharmacie demande une alternative ; ne s'applique pas aux médicaments à marge thérapeutique étroite ni aux mentions « non substituable ».
metadata:
  agent: agent-02-pharmacie-suivi
  statut: v1
  vague: "2"
  cas-de-test: "3/3"
  validation-medicale: requise
---

> **Contenu à valider par le comité médical avant toute mise en production.**
> Les règles de substitution applicables au Gabon (droit de substitution du pharmacien, liste des génériques autorisés) sont **à confirmer**. Validation conjointe comité médical + pharmacien référent.

# Proposition de substitution générique

## Principe
L'agent **prépare** une proposition documentée ; **le pharmacien ou le prescripteur décide**. Le patient est informé de la décision humaine, pas de la proposition de l'IA comme s'il s'agissait d'un conseil.

## Critères d'équivalence à vérifier (tous obligatoires)
- Même **principe actif** (DCI) et même **dosage**.
- Même **forme pharmaceutique** (ou forme équivalente autorisée par la règle validée) et même **voie d'administration**.
- Produit **autorisé** au Gabon et disponible chez un partenaire.
- Pas de mention **« non substituable »** sur l'ordonnance.
- Médicament **hors liste** des marges thérapeutiques étroites ou exclusions validées (ex. à valider : antiépileptiques, anticoagulants oraux, hormones thyroïdiennes, immunosuppresseurs, certains antirétroviraux en association fixe).
- Excipients à effet notoire et allergies du patient (`AllergyIntolerance`) signalés.

Si un seul critère manque ou est incertain → **pas de proposition**, transmettre la situation au prescripteur.

## Déroulé
1. Constater le besoin (rupture, prix, demande de la pharmacie).
2. Vérifier les critères ci-dessus à partir de la base médicaments validée.
3. Rédiger la proposition (`substitution_proposer`) au pharmacien ou au prescripteur : médicament prescrit, générique proposé, critères vérifiés, points d'attention (excipients, allergies déclarées), source de données.
4. Attendre la **décision humaine**. Informer le patient : « Le pharmacien vous propose un médicament équivalent ; il vous expliquera. »
5. Tracer la proposition et la décision.

## Exemple [FICTIF]
> Proposition à Pharmacie Test Nord [FICTIF] : « Ordonnance FICTIF-001 : amoxicilline 500 mg gélule, marque X [FICTIF] en rupture. Générique disponible : amoxicilline 500 mg gélule, labo Y [FICTIF]. Même DCI, dosage, forme, voie. Pas de mention non substituable. Allergie déclarée : aucune. Décision du pharmacien requise. »

## Limites et interdits
- Ne jamais valider une substitution ni la présenter comme décidée.
- Ne jamais proposer une molécule différente (classe voisine) : ce n'est plus une substitution générique mais une modification de traitement.
- Ne jamais proposer de substitution pour une mention « non substituable » ou un médicament exclu.
- Ne jamais conseiller directement le patient sur le choix du médicament.

## Sources
- OMS, *Multisource (generic) pharmaceutical products: guidelines on registration requirements to establish interchangeability*, TRS 1003 annexe 6 (2017) — https://www.who.int/publications/m/item/trs1003-annex6
- OMS, Liste modèle des médicaments essentiels (2023).
- Code de la santé publique français, art. L5125-23 (référence comparative sur le droit de substitution) ; règles gabonaises à confirmer.
