---
name: recherche-profils-sources-legitimes
description: Recherche des professionnels de santé susceptibles de rejoindre Mbolo Santé uniquement via des sources légitimes et autorisées (partenariats, associations professionnelles, diaspora médicale, annuaires publics dont les conditions d'utilisation le permettent, candidatures spontanées), selon des critères professionnels objectifs. À utiliser quand l'équipe recrutement exprime un besoin (spécialité, langue, fuseau horaire, volume) ou pour préparer une campagne de recrutement.
metadata:
  agent: agent-03-recrutement
  statut: v1
  vague: "1"
  cas-de-test: "1/3"
---

> **Version 1** — la liste blanche des sources autorisées est à valider par le DPO.

# Recherche de profils — sources légitimes

## Sources autorisées (liste blanche, à valider)
- Partenariats institutionnels (facultés, hôpitaux, ordres, associations de médecins de la diaspora gabonaise et africaine).
- Annuaires publics **avec API** et conditions d'utilisation permettant l'usage (vérifier et consigner la date de vérification).
- Candidatures spontanées et formulaires Mbolo Santé (consentement recueilli).
- Recommandations de professionnels déjà membres (avec accord de la personne recommandée avant tout contact).

## Sources interdites
LinkedIn (scraping), réseaux sociaux, sites dont les CGU interdisent l'extraction, bases de données achetées sans garantie de licéité.

## Déroulé
1. Traduire le besoin en **critères professionnels** : profession, spécialité, langues (français obligatoire, langues locales appréciées), disponibilité, fuseau horaire, droit d'exercer (à confirmer par `pre-verification-inscription-ordinale`).
2. Interroger les sources de la liste blanche uniquement.
3. Ne collecter que les données nécessaires (nom, profession, spécialité, lieu d'exercice, coordonnées professionnelles publiques, source + date).
4. Créer les fiches dans le CRM avec la **source** et la **base légale** (`conformite-prospection-rgpd`).

## Exemple [FICTIF]
> Besoin : 3 pédiatres francophones, 10 h/semaine. → Recherche dans l'annuaire partenaire de l'association Test Diaspora Médicale [FICTIF] → 5 fiches créées, source et date notées.

## Limites et interdits
- Ne jamais scraper ni contourner des CGU ou des protections techniques.
- Ne jamais filtrer sur un critère discriminatoire (origine, sexe, âge, religion, état de santé).
- Ne jamais contacter un prospect.

## Sources
- CNIL, *La prospection commerciale par courrier électronique* et fiches sur la prospection B2B — https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique
- RGPD art. 5, 6, 14 (information des personnes dont les données n'ont pas été collectées auprès d'elles).
- OMS, *Global Code of Practice on the International Recruitment of Health Personnel* (2010) — https://www.who.int/publications/i/item/wha63.16 — vigilance éthique sur le recrutement dans les pays en pénurie.
