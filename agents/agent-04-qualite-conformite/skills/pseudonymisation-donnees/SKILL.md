---
name: pseudonymisation-donnees
description: Définit et vérifie la pseudonymisation des conversations et des données de santé utilisées pour l'audit, l'évaluation des agents et la formation — remplacement des identifiants directs par des pseudonymes, généralisation des quasi-identifiants, suppression des mentions libres identifiantes, séparation de la table de correspondance — et contrôle qu'aucun jeu de données ne permet une ré-identification. À utiliser avant tout audit de conversations, avant tout export vers l'Agent 4 ou l'Académie, et quand un extrait audité semble contenir une information identifiante.
metadata:
  agent: agent-04-qualite-conformite
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Pseudonymisation des données

## Définitions
- **Pseudonymisation** : les données ne peuvent plus être attribuées à une personne **sans information supplémentaire** (la table de correspondance), conservée séparément. Les données restent des **données personnelles** (RGPD art. 4(5)).
- **Anonymisation** : ré-identification impossible par tout moyen raisonnable. Beaucoup plus exigeante ; requise pour la pédagogie (skill `anonymisation-cas-cliniques` de l'Agent 5).

L'Agent 4 travaille sur des données **pseudonymisées**. Il ne détient **jamais** la table de correspondance (DPO uniquement).

## Règles de transformation (pipeline de la plateforme — vérifiées par l'agent)

| Donnée | Traitement |
|---|---|
| Nom, prénom, surnom | Supprimé → `[PATIENT]`, `[PROCHE]`, `[PRO]` |
| Identifiant patient, n° CNAMGS, n° de pièce | Remplacé par un pseudonyme stable par projet d'audit (HMAC avec clé détenue par le DPO), jamais réversible par l'agent |
| Téléphone, e-mail, adresse | Supprimés |
| Date de naissance | Âge ou tranche d'âge (tranches de 5 ans ; < 2 ans en mois) |
| Dates d'événements | Décalage aléatoire constant par patient ou précision au mois |
| Lieu | Ville ou province uniquement ; quartier et village supprimés si population < seuil à définir |
| Profession, employeur | Généralisés (« commerçant(e) ») ou supprimés |
| Texte libre | Détection d'entités nommées + relecture par échantillonnage ; mentions identifiantes remplacées |
| Photos, audio | **Exclus** des jeux d'audit |
| Maladies rares, situations uniques (ex. « seul médecin du village ») | Généralisées ou exclues (risque d'identification par singularité) |

## Contrôles de l'agent avant tout audit
1. **Absence d'identifiants directs** : recherche automatique (noms courants, formats de téléphone gabonais `+241`, e-mails, numéros).
2. **Quasi-identifiants** : vérifier que chaque combinaison (tranche d'âge, sexe, ville, motif) concerne au moins *k* personnes (k-anonymat, k ≥ 5 proposé) dans le jeu audité ; sinon, signaler.
3. **Texte libre** : échantillon relu ; toute fuite → arrêt de l'audit sur ce lot.
4. **Traçabilité** : consigner la version du pipeline et le résultat des contrôles dans le rapport.

## Si une donnée identifiante est trouvée
1. **Arrêter** l'analyse du lot concerné.
2. Ne **pas** recopier la donnée dans un rapport ou un journal (citer seulement l'identifiant pseudonyme de conversation et la position).
3. `signaler_incident` (type `fuite_pseudonymisation`) au DPO et au responsable sécurité.
4. Reprendre après correction du pipeline et nouveau contrôle.

## Exemple [FICTIF]
Avant (source, jamais vue par l'agent) :
> « Bonjour, je suis Test Mbadinga [FICTIF], 12/03/1988, j'habite Akébé [FICTIF], mon numéro +241 00 00 00 01. »

Après pseudonymisation (vue de l'agent) :
> « Bonjour, je suis [PATIENT], [35-39 ans], j'habite [LIBREVILLE], mon numéro [SUPPRIMÉ]. » — `conv: PSD-7f3a` [FICTIF]

## Limites et interdits
- Ne jamais demander, lire ou tenter de reconstituer la table de correspondance.
- Ne jamais croiser des jeux de données pour ré-identifier une personne.
- Ne jamais recopier une donnée identifiante découverte.
- Ne jamais qualifier de « anonymisé » un jeu seulement pseudonymisé.

## Sources
- RGPD, art. 4(5), 25, 32, 89.
- CEPD, *Guidelines 01/2025 on pseudonymisation* — https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2025/guidelines-012025-pseudonymisation_en
- Groupe de travail Article 29, *Avis 05/2014 sur les techniques d'anonymisation* (WP216).
- ENISA, *Pseudonymisation techniques and best practices* (2019) — https://www.enisa.europa.eu/publications/pseudonymisation-techniques-and-best-practices
- ISO/IEC 20889:2018 — techniques de dé-identification.
