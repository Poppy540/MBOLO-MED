# Protocole de test terrain — faible débit (vague 1)

> **Brouillon v0.1 à valider par le porteur de projet.** Préparé par l'Agent 6 (skill `tests-terrain-reseau-mobile`). Aucune dépense n'est engagée et aucun testeur n'est contacté par un agent : l'équipe humaine s'en charge après validation.
> Exigé par l'ADR-0011 (LiveKit « sous réserve d'un test terrain ») et par le critère de passage de la vague 1 « taux de réussite des consultations ≥ seuil, y compris en 3G » (`docs/deploiement/vagues.md`). Risque lié : R-04, connectivité en province.

## 1. Objet

Les tests de bout en bout mesurent la plateforme sur un **réseau simulé par Chrome** (« 3G lente » : 2 s de latence, 50 Ko/s), avec une caméra simulée. Ce protocole vérifie, sur de **vrais réseaux mobiles gabonais** et de **vrais téléphones d'entrée de gamme**, que les chiffres obtenus en simulation tiennent, et il relève ce que la simulation ne voit pas : coupures, variations de débit, comportement réel du mode économie de données d'Android, et ressenti des personnes.

## 2. Ce qui est comparé

| N° | Scénario | Mesuré en simulation (e2e) | Plafond e2e | Relevé terrain |
|---|---|---|---|---|
| T1 | Première ouverture de l'application patient | ≈ 4,5 s ; 15,9 Ko | 8 s ; 30 Ko | Temps jusqu'au bouton « Se connecter » ; données consommées |
| T2 | Première ouverture de la page de connexion | ≈ 5 s ; 23 Ko | 8 s ; 30 Ko | Temps jusqu'au bouton « Connexion » ; données |
| T3 | Consultation vidéo de 10 min | ≈ 1,9 Mo/min (≈ 19 Mo) | 2,5 Mo/min | Consultation établie ou non ; délai avant connexion ; Mo consommés ; qualité perçue (1 à 5) ; repli audio automatique |
| T4 | Consultation en audio seulement (bouton) | ≈ 300 Ko/min (≈ 3 Mo) | 350 Ko/min | Mo consommés ; qualité de la voix (1 à 5) |
| T5 | Téléphone en **économie de données** | consultation commencée en audio seulement | — | La consultation commence-t-elle en audio sur ce téléphone ? (voir § 6) |
| T6 | Réseau coupé (mode avion) puis saturé (zone blanche, ascenseur) | « Pas de réseau » < 5 s ; « Le réseau est trop lent » < 30 s | idem | Message affiché et délai ; aucune attente sans fin |
| T7 | Paiement simulé : validation sur l'écran de l'opérateur (≈ 3 min hors de l'application), puis retour | une requête à la fois ; vérification dès le retour | — | Confirmation affichée au retour ; données consommées pendant l'attente |
| T8 | Hors ligne : rouvrir l'application sans réseau | rendez-vous retenu affiché | — | Le prochain rendez-vous reste visible |
| T9 | Envoi des deux photos d'identité | délai maximal 2 min par photo | 2 min | Durée de chaque envoi ; réussite |

Les **données consommées** se lisent sur le compteur du téléphone (Android : Paramètres → Réseau → Utilisation des données → Chrome), avant et après chaque scénario. Le compteur inclut le chiffrement TLS et les reprises : un écart de 10 à 20 % avec la simulation est attendu.

## 3. Sites, réseaux et moments

| Dimension | Valeurs | Remarque |
|---|---|---|
| Sites | Libreville (3 quartiers : centre, périphérie, zone dense) ; une ville secondaire ; une zone rurale d'une province ciblée en vague 3 | Choix des lieux par l'équipe terrain |
| Opérateurs | Airtel et Moov | Une carte SIM de test par opérateur et par téléphone |
| Technologie | 4G et 3G forcée (réglage du téléphone) | La 2G est relevée si elle est la seule disponible |
| Moments | Heure creuse (10 h – 12 h) et heure de pointe (18 h – 21 h) | |

**Taille minimale proposée :** 5 sites × 2 opérateurs × 2 moments × T1 à T9, soit 20 sessions d'environ 1 h 30, dont au moins 5 consultations vidéo T3 par opérateur et par type de site.

## 4. Appareils

- 2 ou 3 modèles **Android d'entrée de gamme** représentatifs du marché gabonais (2 Go de mémoire ou moins, Android Go si possible), Chrome à jour, application installée comme application web.
- Un appareil de **point de consultation assistée** (tablette), relevé à part.
- Caches vidés avant T1 et T2 (première ouverture).

## 5. Préparation

1. **Environnement de recette**, jamais la production : il n'existe pas encore (hébergement en attente, ADR-0004). C'est un **prérequis**.
2. **Comptes fictifs** de recette (patients, médecin) ; flags `teleconsultation.video` et `paiement.mobile-money` activés en recette seulement ; **fournisseur de paiement simulé**, aucun argent réel.
3. Un membre de l'équipe joue le **médecin**, depuis un poste fixe à bonne connexion ; aucune décision médicale, aucun conseil médical pendant les tests.
4. Fiches de relevé imprimées (§ 8) et chronomètre.

## 6. Points à vérifier en priorité

- **T5, économie de données** : la plateforme lit `navigator.connection.saveData`. Il faut vérifier sur chaque modèle que Chrome transmet bien le mode « Économiseur de données » d'Android. Sinon, proposer un réglage « Toujours commencer en audio » dans l'application.
- **T3 hors Libreville** : si moins de 8 consultations vidéo sur 10 s'établissent ou se maintiennent, proposer l'**audio par défaut hors Libreville**, avec la vidéo à la demande (décision du porteur de projet, fiche problématique).
- **T6** : aucune attente sans fin, et aucun message « Service indisponible » quand le problème vient du réseau.

## 7. Testeurs et éthique

- Testeurs **volontaires**, majeurs, informés par écrit, avec un **consentement signé** et la possibilité d'arrêter à tout moment. Indemnisation éventuelle : décision du porteur de projet.
- **Aucune donnée de santé réelle** : chaque testeur joue un rôle **[FICTIF]** décrit sur sa fiche (motif fictif, aucun symptôme personnel).
- Les numéros des cartes SIM de test et l'identité des testeurs restent hors du dépôt, conservés par l'équipe terrain.
- Les photos d'identité de T9 sont des **documents fictifs** (spécimens), jamais la pièce d'identité du testeur.

## 8. Fiche de relevé (une par session)

| Champ | Valeur |
|---|---|
| Session | T-AAAA-MM-JJ-n° |
| Site / quartier | |
| Opérateur / technologie affichée | |
| Moment (heure) | |
| Téléphone (modèle) | |
| T1 / T2 : secondes ; Ko | |
| T3 : établie (oui/non) ; délai (s) ; Mo ; qualité 1-5 ; repli audio (oui/non) | |
| T4 : Mo ; qualité de la voix 1-5 | |
| T5 : commence en audio (oui/non) | |
| T6 : message affiché ; délai (s) | |
| T7 : confirmation au retour (oui/non) ; Ko pendant l'attente | |
| T8 : rendez-vous visible hors ligne (oui/non) | |
| T9 : durée de chaque envoi (s) ; réussite | |
| Remarques des testeurs | |

**Exemple [FICTIF]** — Session T-2026-11-04-3 [FICTIF], ville secondaire, Moov 3G, 18 h 30, téléphone d'entrée de gamme : T1 6,8 s et 19 Ko ; T3 établie après 9 s, 23 Mo en 10 min, qualité 3/5, repli audio automatique à 6 min ; T4 3,4 Mo, voix 4/5 ; T5 non (mode non transmis par ce modèle) ; T6 « Le réseau est trop lent » après 21 s.

## 9. Analyse et restitution

- Rapport par **site, opérateur, technologie et moment** : taux de consultations établies et menées à terme, médiane et pire cas de chaque mesure, écart avec la simulation (§ 2).
- Comparaison avec les budgets du skill `optimisation-faible-debit` et avec le seuil du critère de vague, une fois ce seuil fixé.
- Recommandations, et une **fiche problématique** pour tout critère non atteint (par exemple l'audio par défaut en province).
- Mise à jour des plafonds des e2e si le terrain montre qu'ils sont trop larges ou trop serrés.

## 10. Décisions attendues du porteur de projet

1. Valider ce protocole et la taille de l'échantillon.
2. **Budget** : cartes SIM et forfaits de données, 2 ou 3 téléphones, déplacements, indemnités éventuelles des testeurs.
3. Désigner l'équipe terrain et le responsable des relevés.
4. Fixer le **seuil chiffré** du critère de vague « taux de réussite des consultations, y compris en 3G » (par exemple ≥ 90 % en audio et ≥ 80 % en vidéo, à confirmer).
5. Dates, une fois l'environnement de recette disponible.

## Limites

- Ce protocole ne remplace pas l'avis du comité médical sur la qualité nécessaire à une consultation : il mesure la technique, pas la pertinence clinique.
- Un test ponctuel ne reflète pas toutes les saisons ni toutes les charges du réseau : à répéter avant la vague 3 (province).

## Sources

- Mesures simulées : `platform/tests/features-gherkin/faible-debit/reseau-lent.feature` et `platform/tests/e2e-playwright/README.md` (PR n°124 à n°131).
- UIT-T P.800 (qualité perçue, échelle de 1 à 5) et G.114 (latence de bout en bout).
- W3C, *Identifiers for WebRTC's Statistics API* — https://www.w3.org/TR/webrtc-stats/
- W3C, *Network Information API* (`saveData`, `effectiveType`) — https://wicg.github.io/netinfo/
- GSMA Intelligence, *The Mobile Economy Sub-Saharan Africa* — https://www.gsma.com/mobileeconomy/sub-saharan-africa/
