---
name: collecte-retours-terrain
description: Organise la collecte et la synthèse des retours terrain (patients via enquêtes et support anonymisés, professionnels, pharmaciens, infirmiers des points assistés, testeurs) — sources, grille de codage thématique, fréquence, gravité — et en tire des constats et propositions pour le backlog, le registre des risques et les revues de vague, sans jamais traiter de données nominatives. À utiliser chaque semaine pendant une vague, après une session de tests terrain, et quand un thème revient souvent dans le support.
metadata:
  agent: pilote-projet
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Collecte des retours terrain

## Sources (anonymisées ou agrégées uniquement)
- Enquêtes de satisfaction (via l'Agent 4, agrégées).
- Tickets du support **anonymisés**.
- Entretiens et réunions avec professionnels, pharmaciens, infirmiers (comptes rendus sans données de patients).
- Tests terrain (`tests-terrain-reseau-mobile`).
- Retours de l'équipe de terrain (visites de points assistés).

## Grille de codage
| Thème | Exemples |
|---|---|
| Accès / connexion | Coupures, coût des données, appareil |
| Compréhension | Langue, texte trop long, pictogrammes |
| Confiance | IA, confidentialité, professionnel étranger |
| Parcours | Paiement, délai, ordonnance, pharmacie |
| Clinique (à transmettre) | Tout élément suggérant un risque pour un patient → Agent 4 / directeur médical |
| Économique | Prix, mode de paiement, abonnement |

Pour chaque thème : fréquence, tendance, gravité, citations **reformulées** (jamais nominatives).

## Déroulé
1. Rassembler les retours de la période ; vérifier l'absence de données personnelles (sinon : ne pas utiliser, signaler).
2. Coder ; compter ; dégager les 3–5 thèmes principaux.
3. **Tout signal de sécurité patient** → transmission immédiate (alerte selon `filtrage-alertes`).
4. Propositions : stories (`pilote-conception`), risques (`registre-risques`), fiches.
5. Restituer dans le rapport hebdomadaire et la revue de vague.

## Exemple [FICTIF]
> Semaine 42 [FICTIF] : 64 retours. 1) Coût des données mobiles (19) ; 2) Méfiance envers l'assistant IA (11 : « je veux parler à un humain ») ; 3) Pharmacie partenaire trop loin (8). Proposition : bouton « parler à un humain » visible dès l'accueil.

## Limites et interdits
- Ne jamais utiliser un retour contenant des données nominatives ou de santé identifiantes ; le signaler.
- Ne jamais contacter un patient, un professionnel ou un partenaire : l'équipe humaine le fait.
- Ne jamais écarter un retour isolé qui évoque un risque pour un patient.

## Sources
- Braun V., Clarke V., « Using thematic analysis in psychology », *Qual Res Psychol* 2006 (analyse thématique).
- Nielsen Norman Group, « Affinity Diagramming » — https://www.nngroup.com/articles/affinity-diagram/
