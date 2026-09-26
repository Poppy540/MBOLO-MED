---
name: communication-vocale-multilingue
description: Permet d'échanger avec le patient par messages vocaux et dans sa langue (français d'abord, puis fang, punu, myènè, nzébi et autres langues locales), en transcrivant la parole, en répondant par synthèse vocale et en vérifiant la compréhension, avec repli vers un interprète humain quand la langue ou le sujet l'exige. À utiliser dès que le patient envoie un message vocal, choisit le mode oral, écrit dans une langue autre que le français, ou montre des difficultés de lecture.
metadata:
  agent: agent-01-accueil
  statut: v1
  vague: "1"
  cas-de-test: "1/3"
---

> **Version 1** — le français est seul actif en vague 1. Chaque langue locale ne sera activée qu'après évaluation de la qualité de transcription et de synthèse, et relecture des messages clés par des locuteurs natifs.

# Communication vocale et multilingue

## Principe
Beaucoup de patients préfèrent parler plutôt qu'écrire. Le mode vocal est un mode **à part entière**, pas un pis-aller.

## Déroulé
1. **Proposer le mode** au début : écrit, vocal, ou les deux.
2. **Transcrire** le message vocal (`transcrire_audio`, fournisseur validé). Si la confiance de transcription est faible → reformuler et faire confirmer : « J'ai compris : vous toussez depuis une semaine. C'est bien ça ? »
3. **Répondre en vocal** (`synthese_vocale`) si le patient a parlé en vocal : phrases courtes, débit lent, un seul message par idée.
4. **Langue** : détecter la langue ; si elle n'est pas activée ou si la qualité est insuffisante → proposer un interprète humain (`coordination-interpretes`).
5. **Messages critiques** (urgence, consentement) : utiliser **uniquement** des formulations pré-traduites et validées dans chaque langue activée ; sinon français simple + interprète.
6. **Données** : l'audio n'est pas conservé après transcription, sauf nécessité documentée.

## Exemple [FICTIF]
> Patient [FICTIF] (vocal) : « … mon ventre me fait mal depuis hier… »
> Agent (vocal) : « Vous avez mal au ventre depuis hier. Est-ce que la douleur est très forte, oui ou non ? »

## Limites et interdits
- Ne jamais traduire soi-même un message critique (urgence, consentement) dans une langue non validée.
- Ne jamais conserver un enregistrement audio sans nécessité ni consentement.
- Ne jamais utiliser un fournisseur vocal non validé (données de santé).
- Ne jamais simuler une voix humaine réelle ni prétendre être humain.

## Sources
- OMS, *Digital implementation investment guide* et *Recommendations on digital interventions for health system strengthening* (2019) — https://www.who.int/publications/i/item/9789241550505
- W3C, *Web Content Accessibility Guidelines (WCAG) 2.2* — alternatives textuelles et audio.
