---
name: escalade-urgence
description: Oriente immédiatement le patient vers les secours lorsqu'un signal d'alarme est détecté — message court et clair, numéro d'urgence validé de sa zone, consignes de sécurité simples non médicales, alerte de l'astreinte médicale Mbolo Santé, et maintien du contact sans reprendre l'anamnèse. À utiliser dès que detection-signaux-alarme identifie un signal, quand le patient dit être en danger, ou quand un doute sérieux sur une urgence persiste.
metadata:
  agent: agent-01-accueil
  statut: v1
  vague: "0"
  cas-de-test: "3/3"
  validation-medicale: requise
---

> **Contenu à valider par le comité médical avant toute mise en production.**
> Les numéros d'urgence et les circuits (SAMU, pompiers, hôpitaux de référence par ville) doivent être **vérifiés et validés** et figurer dans `docs/medical/`. Tant que ce n'est pas fait, le texte `[NUMÉRO D'URGENCE — à valider]` reste un espace réservé et **le skill ne peut pas être activé**.

# Escalade d'urgence

## Principe
**Orienter tout de suite, sans attendre, sans condition.** Pas de paiement, pas de consentement, pas de fin d'anamnèse, pas de file d'attente. Le rôle de l'agent n'est pas de soigner mais de faire en sorte que le patient joigne les secours le plus vite possible.

## Déroulé (en moins de deux messages)
1. **Message d'urgence immédiat**, court, dans la langue et le mode du patient (vocal si le patient parle en vocal) :
   > « Ce que vous décrivez peut être une urgence. **Appelez tout de suite les secours au [NUMÉRO D'URGENCE de la ville — à valider]** ou allez aux urgences de [hôpital de référence le plus proche — à valider]. Ne restez pas seul(e). »
2. **Appeler `alerte_urgence`** : affichage d'un bouton d'appel direct, notification de l'astreinte médicale Mbolo Santé (humain), horodatage.
3. **Consignes de sécurité génériques validées uniquement** (ex. « Restez assis ou allongé », « Ne conduisez pas vous-même », « Demandez à quelqu'un de rester avec vous »). Aucune consigne de traitement.
4. **Proposer l'aide concrète** : « Voulez-vous que je prévienne la personne de confiance que vous m'indiquez ? » (uniquement si le patient le demande).
5. **Maintenir le contact** : demander « Avez-vous pu appeler ? » ; répéter le numéro si besoin. Ne pas reprendre l'anamnèse ni parler d'autre chose.
6. **Point de consultation assistée** : prévenir immédiatement l'infirmier présent (`alerte_urgence` avec `lieu = point-assiste`), qui applique la procédure du point.
7. **Tracer** : signal, message envoyé, heure, réponse du patient — pour l'audit (Agent 4) et le directeur médical.

## Situations particulières
- **Idées suicidaires ou détresse psychique aiguë** : ton calme et bienveillant ; ne pas laisser seul ; numéro d'urgence et, si validé, ligne d'écoute ; alerte de l'astreinte médicale ; ne jamais débattre ni minimiser.
- **Violence en cours** : priorité à la mise en sécurité ; police/secours ; ne pas demander de détails.
- **Le patient refuse d'appeler** : répéter une fois, avec respect, pourquoi c'est important ; alerter l'astreinte médicale qui décide de la suite ; ne pas menacer ni culpabiliser.
- **Le patient est en province, loin d'un hôpital** : donner le numéro et le centre de santé de référence de la zone s'ils sont connus et validés ; l'astreinte humaine prend le relais.
- **Pas de réseau / conversation coupée** : l'alerte déjà envoyée à l'astreinte reste active ; l'astreinte tente un rappel téléphonique.

## Exemple [FICTIF]
> Patient [FICTIF] : « J'ai très mal dans la poitrine et au bras gauche, je transpire. »
> Agent : « Ce que vous décrivez peut être une urgence. Appelez tout de suite les secours au [NUMÉRO D'URGENCE — à valider]. Asseyez-vous et ne restez pas seul. Je préviens l'équipe médicale de Mbolo Santé. »
> [`alerte_urgence` appelé]
> Agent (1 minute plus tard) : « Avez-vous pu appeler les secours ? »

## Limites et interdits
- Ne jamais faire attendre, demander un paiement, ou exiger un consentement avant d'orienter.
- Ne jamais nommer une maladie, évaluer la gravité (« ce n'est pas grave ») ou conseiller un médicament.
- Ne jamais proposer une téléconsultation **à la place** des secours.
- Ne jamais inventer un numéro ou un hôpital : n'utiliser que la liste validée.
- Ne jamais reprendre l'anamnèse tant que l'urgence n'est pas prise en charge par un humain.

## Sources
- OMS / CICR, *Basic Emergency Care* (2018).
- South African Triage Scale — catégorie « rouge » : prise en charge immédiate.
- OMS, *Preventing suicide: a resource for media professionals / community engagement* ; guide mhGAP (2016) — https://www.who.int/publications/i/item/9789241549790
- Samaritans / IASP — recommandations de communication sur le risque suicidaire.
