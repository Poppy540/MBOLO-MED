---
name: anonymisation-cas-cliniques
description: Transforme un cas clinique issu de la pratique en cas pédagogique totalement anonymisé (suppression et généralisation des identifiants, modification des détails singuliers, vérification du risque de ré-identification, exclusion des images identifiantes, consentement parental pour la pédiatrie) et le soumet à validation humaine avant tout usage. À utiliser quand un mentor propose un cas réel pour l'Académie, ou avant d'utiliser un cas dans le tuteur, le patient virtuel ou un TCS.
metadata:
  agent: agent-05-academie
  statut: v1
  vague: "3"
  cas-de-test: "1/3"
---

> **Version 1** — procédure de validation (médecin + DPO) à formaliser.

# Anonymisation des cas cliniques

## Principe
**Anonymiser**, pas seulement pseudonymiser : personne ne doit pouvoir reconnaître le patient, y compris sa famille, ses voisins ou le soignant d'un petit centre de santé. Au Gabon, les petites communautés rendent la ré-identification plus facile : être plus strict.

## Étapes
1. Vérifier l'origine et l'autorisation (le mentor atteste le droit d'utiliser le cas ; **pédiatrie : consentement parental obligatoire**).
2. Supprimer : noms, dates exactes, lieux précis, établissements, professions singulières, numéros, photos du visage ou de signes distinctifs (tatouages, cicatrices).
3. Généraliser : âge en tranche, ville → région, dates → durées relatives.
4. Modifier les détails **non pédagogiques** singuliers (ordre de la fratrie, événement marquant) ; conserver ce qui est cliniquement nécessaire.
5. Évaluer le risque de ré-identification (« quelqu'un de la communauté reconnaîtrait-il ce cas ? ») ; cas rare ou très médiatisé → modifier davantage ou renoncer.
6. Marquer « Cas inspiré d'un cas réel, anonymisé » et soumettre au médecin relecteur + DPO. **Aucun usage avant validation.**

## Exemple [FICTIF]
> Source : « Mme X, institutrice à Mitzic, 3 enfants, admise le 12 mars… » → Cas : « Femme de 30-35 ans, région du Woleu-Ntem, consulte pour… »

## Limites et interdits
- Ne jamais utiliser un cas réel non validé ; ne jamais utiliser un cas pédiatrique sans consentement parental.
- Ne jamais conserver la version source dans l'Académie.
- Ne jamais présenter un cas anonymisé comme fictif ni l'inverse.

## Sources
- Groupe de travail Article 29, *Avis 05/2014 sur les techniques d'anonymisation* (WP216).
- ICMJE, *Protection of Research Participants* (consentement pour publication de cas) — https://www.icmje.org/recommendations/browse/roles-and-responsibilities/protection-of-research-participants.html
- CARE guidelines for case reports — https://www.care-statement.org/
