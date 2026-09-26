---
name: consentement-proches-diaspora
description: Conçoit les parcours et règles de consentement pour les proches, aidants et membres de la diaspora (abonnement Famille) — qui paie ne voit pas automatiquement, accès délégué granulaire et révocable, consentement du patient lui-même, cas des mineurs et des personnes vulnérables — et les traduit en user stories. À utiliser pour concevoir l'offre Diaspora, tout partage avec un proche, ou pour analyser une demande d'accès d'un tiers.
metadata:
  agent: pilote-conception
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1** — règles juridiques (majorité, représentation légale, personnes vulnérables) à confirmer par un juriste.

# Consentement des proches et de la diaspora

## Principes
1. **Payer n'est pas voir** : l'abonné Diaspora finance, il n'accède à rien sans consentement du patient.
2. **Accès granulaire** : le patient choisit quoi partager (rendez-vous seulement, résumé de consultation, ordonnances…), avec qui, pour combien de temps.
3. **Révocable** à tout moment, sans justification, sans conséquence sur les soins.
4. **Recueilli auprès du patient lui-même**, dans sa langue, par un canal où il est seul si possible (éviter la pression familiale).
5. Mineurs et majeurs protégés : représentant légal ; avis de la personne recherché ; règles à confirmer.
6. Sujets sensibles (santé mentale, VIH, santé sexuelle et reproductive) : **exclus par défaut** de tout partage, même si un partage général est accordé.

## Niveaux de partage proposés
| Niveau | Contenu |
|---|---|
| 0 | Aucun (défaut) |
| 1 | Le proche sait qu'un rendez-vous est pris / a eu lieu |
| 2 | + ordonnances et rappels |
| 3 | + résumé de consultation (hors sujets sensibles) |

## Exemple [FICTIF]
> Abonné Test AQ [FICTIF] (Paris) pour sa mère Test AR [FICTIF] (Oyem). La mère choisit le niveau 1 pour 6 mois. Test AQ voit « rendez-vous du 12/10 : effectué », rien d'autre.

## Limites et interdits
- Ne jamais concevoir un accès par défaut pour le payeur.
- Ne jamais permettre de consentement donné par le proche à la place du patient (hors représentation légale).
- Ne jamais inclure les sujets sensibles dans un partage sans choix explicite spécifique.

## Sources
- RGPD art. 7, 9 ; CEPD, lignes directrices 05/2020 sur le consentement.
- HL7 FHIR Consent (provisions par catégorie et par acteur) — https://hl7.org/fhir/R4/consent.html
- OMS, *Consolidated guideline on sexual and reproductive health and rights of women living with HIV* (2017) — confidentialité.
