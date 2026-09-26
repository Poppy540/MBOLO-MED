---
name: triage-protocole-valide
description: Applique pas à pas le protocole de triage validé par le comité médical (inspiré de la South African Triage Scale) pour attribuer un niveau de priorité et un délai de prise en charge, sans jamais interpréter ni poser de diagnostic. À utiliser après le consentement et l'anamnèse initiale, lorsqu'aucun signal d'alarme n'a été détecté, pour déterminer le niveau de priorité qui guidera orientation-professionnel ; au point de consultation assistée, il intègre les mesures des objets connectés.
metadata:
  agent: agent-01-accueil
  statut: v1
  vague: "0"
  cas-de-test: "3/3"
  validation-medicale: requise
---

> **Contenu à valider par le comité médical avant toute mise en production.**
> Ce skill décrit **la manière d'appliquer** un protocole. Il ne contient pas le protocole lui-même, qui doit être rédigé, validé et signé dans `docs/medical/`. Tant que ce protocole n'existe pas, ce skill ne peut être utilisé que sur des cas fictifs.

# Triage selon le protocole validé

## Référence : la South African Triage Scale (SATS)
La SATS, conçue pour des contextes à ressources limitées, combine :
- un **score physiologique** (TEWS : mobilité, fréquence respiratoire, fréquence cardiaque, pression systolique, température, niveau de conscience AVPU, traumatisme) ;
- des **discriminateurs cliniques** (signes qui classent directement dans une catégorie).

Catégories SATS et délais cibles (hôpital) : **rouge** immédiat · **orange** < 10 min · **jaune** < 60 min · **vert** < 240 min · **bleu** décédé.

**Adaptation Mbolo Santé (proposition à valider)** :
- En **téléconsultation smartphone**, aucune mesure n'est disponible : seuls les **discriminateurs déclarés** sont utilisables. Rouge et orange → **secours** (`escalade-urgence`), jamais une téléconsultation.
- Au **point de consultation assistée**, les objets connectés fournissent une partie du TEWS ; l'infirmier présent valide les mesures.
- Jaune et vert → téléconsultation, avec un délai cible fixé par le comité médical (ex. jaune : le jour même ; vert : sous 48 h).

## Déroulé
1. **Vérifier** qu'aucun signal d'alarme n'est présent (`detection-signaux-alarme`). S'il y en a un → `escalade-urgence`, fin du triage.
2. **Charger la version en vigueur** du protocole validé (numéro de version enregistré dans le dossier).
3. **Poser les questions du protocole dans l'ordre**, telles qu'elles sont formulées, sans en ajouter ni en sauter. Adapter uniquement la forme (langue, vocal, pictogrammes), jamais le fond.
4. **Point assisté** : récupérer les mesures des objets connectés validées par l'infirmier.
5. **Calculer la catégorie** exactement selon les règles du protocole. Si une réponse manque ou est ambiguë → catégorie **la plus haute** compatible, et transfert à un humain si nécessaire.
6. **Enregistrer** : catégorie, version du protocole, réponses, mesures → `Observation` (triage) + `QuestionnaireResponse`.
7. **Transmettre** la catégorie à `orientation-professionnel`.
8. **Dire au patient** ce qui va se passer (délai, type de professionnel), **sans** lui annoncer une « gravité » : « Un médecin généraliste pourra vous voir aujourd'hui. »

## Exemple [FICTIF]
> Protocole v0-FICTIF. Patient [FICTIF], 34 ans, smartphone. Motif : toux depuis 5 jours, pas de difficulté respiratoire, pas de douleur thoracique, pas de fièvre élevée déclarée. Aucun discriminateur rouge/orange.
> → Catégorie « vert » (selon règles fictives) → orientation médecine générale, délai cible du protocole.
> Message : « Merci. Je vous propose une consultation avec un médecin généraliste. Voici les créneaux disponibles. »

## Limites et interdits
- Ne jamais modifier, compléter ou « améliorer » le protocole ; ne jamais orienter hors protocole.
- Ne jamais annoncer un niveau de gravité ou un diagnostic au patient.
- Ne jamais choisir une catégorie plus basse en cas de doute.
- Ne jamais utiliser une version de protocole non validée en production.
- Ne jamais classer en téléconsultation un patient rouge ou orange.

## Sources
- EMSSA, *South African Triage Scale Training Manual* — https://emssa.org.za/sats/
- Gottschalk S.B. et al., « The South African Triage Scale: an evidence-based triage tool », *Emergency Medicine Journal* 2006;23:149-153.
- Twomey M. et al., validation de la SATS en contextes à ressources limitées, *Resuscitation* 2012.
- OMS, *Emergency Triage Assessment and Treatment (ETAT)* — https://www.who.int/publications/i/item/9789241510219
- Revue sur le télé-triage : Huibers L. et al., « Safety of telephone triage in out-of-hours care: a systematic review », *Scand J Prim Health Care* 2011.
