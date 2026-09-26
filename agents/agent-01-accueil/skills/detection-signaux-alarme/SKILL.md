---
name: detection-signaux-alarme
description: Surveille en continu chaque message, message vocal, photo et mesure d'objet connecté pour repérer un signal d'alarme (urgence vitale ou potentiellement grave) selon la liste validée par le comité médical, et déclenche immédiatement le skill escalade-urgence. À utiliser en permanence pendant toute l'interaction, avant et pendant l'anamnèse, y compris avant le consentement, et chaque fois qu'un patient ou un proche décrit un symptôme, un accident, une violence ou une détresse.
metadata:
  agent: agent-01-accueil
  statut: v1
  vague: "0"
  cas-de-test: "3/3"
  validation-medicale: requise
---

> **Contenu à valider par le comité médical avant toute mise en production.**
> La liste ci-dessous est une **liste de travail** inspirée des discriminateurs d'urgence de la South African Triage Scale et des signes d'urgence de l'OMS (ETAT / IMCI). Seule la liste validée et signée dans `docs/medical/` fait foi en production.

# Détection des signaux d'alarme

## Principe
Détecter, pas diagnostiquer. Tu ne cherches pas à savoir **ce que** le patient a, seulement **si** ce qu'il décrit fait partie des signaux qui imposent une orientation immédiate vers les secours. Dans le doute, **considère que c'est un signal**. Un faux positif coûte un appel aux secours ; un faux négatif peut coûter une vie.

## Quand
- À **chaque** message, dès le premier, y compris avant le consentement et pendant toute l'anamnèse.
- Sur les messages vocaux transcrits, les photos (ex. plaie, sang), et les mesures d'objets connectés au point assisté.
- Quand c'est un proche qui décrit l'état du patient.

## Liste de travail des signaux (à valider)

**Respiration et circulation**
- Difficulté importante à respirer, ne peut pas finir une phrase, lèvres bleues.
- Douleur dans la poitrine (serrement, pression), surtout avec sueurs, essoufflement, douleur dans le bras ou la mâchoire.
- Saignement abondant qui ne s'arrête pas ; vomissement ou selles de sang.

**Neurologique**
- Perte de connaissance, somnolence anormale, confusion soudaine.
- Convulsions en cours ou récentes.
- Faiblesse ou paralysie soudaine d'un côté, visage qui tombe, difficulté soudaine à parler.
- Mal de tête brutal et très intense (« le pire de ma vie »).

**Enfant (signes d'urgence OMS)**
- Ne peut pas boire ni téter, vomit tout, convulsions, léthargie ou inconscience.
- Respiration très rapide ou difficile, tirage.
- Nourrisson de moins de 2 mois avec fièvre.
- Signes de déshydratation sévère (yeux très enfoncés, ne boit plus).

**Grossesse et post-partum**
- Saignement vaginal pendant la grossesse ou après l'accouchement.
- Convulsions, maux de tête sévères avec troubles de la vue.
- Douleur abdominale intense ; perte de liquide avant terme ; bébé qui ne bouge plus.
- Fièvre après l'accouchement.

**Autres**
- Fièvre élevée avec raideur de la nuque, taches sur la peau, ou confusion.
- Brûlure étendue, traumatisme grave, accident de la route, chute de hauteur.
- Morsure de serpent ; intoxication ou ingestion de produit toxique ou de médicaments en quantité.
- Réaction allergique avec gonflement du visage ou de la gorge, difficulté à respirer.
- Drépanocytose connue avec douleur intense, fièvre, ou difficulté à respirer.
- **Idées suicidaires, intention de se faire du mal, ou violence en cours** (y compris violences conjugales ou sexuelles récentes).

**Mesures d'objets connectés (point assisté) — seuils à fixer par le comité médical**
- SpO2, fréquence cardiaque, tension artérielle, température, glycémie hors des seuils d'alerte validés → signal.

## Déroulé
1. Repérer un signal (mots-clés, sens général, mesure) — **même s'il est mentionné en passant** ou par un proche.
2. En cas d'ambiguïté, poser **une seule** question fermée de clarification (« Avez-vous du mal à respirer en ce moment, oui ou non ? »). Si pas de réponse claire rapidement → traiter comme signal.
3. Déclencher `escalade-urgence` **immédiatement**. Aucune autre question d'anamnèse avant.
4. Enregistrer le signal détecté (texte déclaré + horodatage) pour la traçabilité et l'audit de l'Agent 4.

## Exemples [FICTIF]
> Patiente [FICTIF] : « Je viens pour un renouvellement, et sinon depuis ce matin j'ai une douleur qui serre dans la poitrine. »
> → Signal (douleur thoracique mentionnée en passant) → `escalade-urgence` immédiatement, le renouvellement attendra.

> Proche [FICTIF] : « Mon fils de 3 ans a de la fièvre et ne veut plus rien boire depuis hier. »
> → Signal enfant (ne boit plus) → `escalade-urgence`.

## Limites et interdits
- Ne jamais nommer une maladie (« c'est peut-être un infarctus ») : dire seulement que la situation peut être une urgence.
- Ne jamais rassurer sur la gravité (« ce n'est sûrement rien »).
- Ne jamais poursuivre l'anamnèse avant d'avoir orienté vers les secours.
- Ne jamais modifier ni compléter la liste validée ; proposer des ajouts au comité médical via une fiche.

## Sources
- South African Triage Scale (SATS), Training Manual, Emergency Medicine Society of South Africa — https://emssa.org.za/sats/
- OMS, *Emergency Triage Assessment and Treatment (ETAT)* — https://www.who.int/publications/i/item/9789241510219
- OMS, *Prise en charge intégrée des maladies de l'enfant (PCIME / IMCI)*, signes généraux de danger.
- OMS, *Recommandations sur les soins prénatals* (2016), signes de danger pendant la grossesse.
- OMS / CICR, *Basic Emergency Care* (2018) — https://www.who.int/publications/i/item/basic-emergency-care-approach-to-the-acutely-ill-and-injured
