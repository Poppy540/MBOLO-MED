---
name: coordination-interpretes
description: Organise l'intervention d'un interprète humain en langue locale (fang, punu, myènè, nzébi, etc.) pour l'accueil ou la consultation — détection du besoin, consentement du patient à la présence de l'interprète, réservation, briefing de confidentialité, et repli si aucun interprète n'est disponible. À utiliser quand le patient ne parle pas ou comprend mal le français, quand la langue n'est pas activée dans l'assistant, ou quand un sujet sensible exige une traduction humaine fiable.
metadata:
  agent: agent-01-accueil
  statut: v1
  vague: "3"
  cas-de-test: "1/3"
---

> **Version 1** — réseau d'interprètes à constituer (vague 3). Skill ajouté à la demande du porteur de projet (D-0001).

# Coordination des interprètes

## Principe
Un interprète humain qualifié est préférable à une traduction automatique pour les échanges médicaux. Il est tenu à la confidentialité et n'est **ni un proche ni un soignant**.

## Déroulé
1. **Détecter le besoin** : patient qui répond en langue locale, qui demande « quelqu'un qui parle [langue] », ou compréhension incertaine après reformulation.
2. **Expliquer et obtenir l'accord** du patient pour la présence d'un interprète (consentement ajouté au dossier).
3. **Réserver** (`demander_interprete`) : langue, variante dialectale si connue, créneau aligné sur la consultation, sexe de l'interprète si le patient le demande (sujets intimes).
4. **Informer le professionnel** dans le résumé : « Interprète [langue] prévu ».
5. **Pas d'interprète disponible** : le dire ; proposer un autre créneau, ou un proche **uniquement si le patient le choisit** et en l'informant des limites (confidentialité, exactitude) ; **jamais un enfant** comme interprète pour un sujet médical, sauf urgence.
6. **Urgence** : ne jamais attendre un interprète ; message d'urgence pré-traduit + pictogrammes + `escalade-urgence`.

## Exemple [FICTIF]
> Patiente [FICTIF] : « Je parle mieux punu. »
> Agent : « Je peux demander une interprète en punu pour votre consultation. Elle respecte le secret. Êtes-vous d'accord ? »

## Limites et interdits
- Ne jamais imposer un interprète ni un proche comme interprète.
- Ne jamais transmettre le dossier complet à l'interprète : seulement l'heure, la langue et le contexte minimal.
- Ne jamais retarder une urgence pour attendre un interprète.

## Sources
- Karliner L.S. et al., « Do professional interpreters improve clinical care for patients with limited English proficiency? A systematic review », *Health Serv Res* 2007.
- National Council on Interpreting in Health Care (NCIHC), *National Code of Ethics for Interpreters in Health Care* — https://www.ncihc.org/ethics-and-standards-of-practice
