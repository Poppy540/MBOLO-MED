---
name: tests-terrain-reseau-mobile
description: Prépare, encadre et analyse les tests terrain de Mbolo Santé sur réseaux mobiles réels (3G/4G, Libreville et province, opérateurs Airtel et Moov) avec des appareils d'entrée de gamme et des testeurs volontaires — protocole, scénarios fictifs, mesures (réussite de connexion, qualité audio/vidéo, temps de chargement, consommation de données, repli audio), consentement des testeurs — et restitue des résultats exploitables. À utiliser avant chaque vague, avant l'ouverture d'une nouvelle ville ou province, et quand les indicateurs de connexion se dégradent.
metadata:
  agent: pilote-qualite
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Tests terrain sur réseau mobile

## Principe
Les émulations de réseau ne remplacent pas le terrain. Les tests sont menés **par des humains** (équipe, testeurs volontaires rémunérés ou indemnisés selon décision du porteur de projet) ; l'agent prépare le protocole, les scénarios et l'analyse.

## Protocole (à valider par le porteur de projet)
1. **Sites** : Libreville (plusieurs quartiers), une ville secondaire, une zone rurale par province ciblée.
2. **Réseaux** : Airtel et Moov ; 3G et 4G ; heures creuses et de pointe.
3. **Appareils** : 2–3 modèles Android d'entrée de gamme représentatifs ; un appareil de point assisté.
4. **Scénarios** (100 % fictifs) : inscription ; consentement ; accueil vocal ; téléconsultation vidéo 10 min avec un « médecin » de l'équipe jouant le rôle ; repli audio forcé ; paiement en bac à sable ; réception d'un rappel ; mode hors ligne puis reprise.
5. **Testeurs** : information et consentement écrit ; **aucune donnée de santé réelle** (rôles fictifs) ; possibilité d'arrêter à tout moment.

## Mesures
| Mesure | Outil |
|---|---|
| Débit, latence, perte (par test) | Application de mesure + statistiques WebRTC (getStats) |
| Taux de réussite de connexion et durée avant connexion | Journaux de la recette |
| Qualité perçue audio/vidéo (1–5) | Questionnaire court |
| Temps de chargement des écrans | Journaux + chronométrage |
| Données consommées par consultation (Mo) | Compteur de l'appareil |
| Réussite du repli audio et de la reprise hors ligne | Observation |

## Restitution
Rapport par site / opérateur / technologie ; comparaison aux budgets de `optimisation-faible-debit` ; recommandations ; fiche problématique si un critère de vague n'est pas atteint.

## Exemple [FICTIF]
> Session T3 [FICTIF], ville secondaire, Moov 3G, 18 h : 7/10 consultations vidéo établies, 10/10 en audio après repli ; 38 Mo par consultation vidéo → recommandation : audio par défaut hors Libreville, vidéo à la demande.

## Limites et interdits
- Ne jamais utiliser de vrais patients ni de vraies données de santé pendant les tests terrain.
- Ne jamais engager de dépense (indemnités, forfaits) : proposition au porteur de projet.
- Ne jamais contacter de testeurs directement : l'équipe humaine s'en charge.

## Sources
- UIT-T P.800 (MOS, qualité perçue) et G.114 (latence de bout en bout).
- W3C, *Identifiers for WebRTC's Statistics API* — https://www.w3.org/TR/webrtc-stats/
- GSMA Intelligence, couverture et usage mobile en Afrique subsaharienne — https://www.gsma.com/mobileeconomy/sub-saharan-africa/
- ARCEP Gabon (régulateur des télécommunications) — rapports de qualité de service, si disponibles.
