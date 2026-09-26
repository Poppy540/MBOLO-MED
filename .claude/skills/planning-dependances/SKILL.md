---
name: planning-dependances
description: Construit et tient le planning de Mbolo Santé par vague — jalons, livrables, dépendances techniques, juridiques, médicales et humaines (validation du comité médical, avis juridique, recrutement, hébergement, partenariats), chemin critique et marges — et signale les glissements et leurs effets en chaîne. À utiliser pour planifier une vague, chaque semaine pour le suivi, et dès qu'une dépendance bloque ou glisse.
metadata:
  agent: pilote-projet
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Planning et dépendances

## Contenu du planning (`control-room/planning.md`, à créer au premier usage)
| ID | Livrable / jalon | Vague | Responsable (rôle) | Début | Fin prévue | Fin réelle | Dépend de | Type de dépendance | Statut |
|---|---|---|---|---|---|---|---|---|---|

Types de dépendance : **technique** (service, intégration), **juridique** (avis, autorisation), **médicale** (validation comité), **humaine** (recrutement, rôle nommé), **partenaire** (pharmacie, opérateur, hébergeur), **financière** (décision de dépense).

## Dépendances structurantes connues (vague 0 → 1)
- Avis juridique téléconsultation (R-01) → conditions de recrutement des médecins (Agent 3) → vivier de médecins → ouverture vague 1.
- Choix d'hébergeur (R-03) → coffre-fort → déploiement recette réaliste → tests de sécurité.
- Comité médical constitué → protocole de triage et signaux d'alarme validés → skills cliniques de l'Agent 1 en `complet` → vague 1.
- Nomination responsable sécurité, directeur médical (R-06) → circuits d'alerte opérationnels.

## Méthode
1. Lister les livrables par vague à partir de `docs/deploiement/vagues.md` et des critères de passage.
2. Relier les dépendances ; calculer le **chemin critique** (plus longue chaîne) ; afficher les marges.
3. Chaque semaine : mettre à jour les dates réelles ; recalculer ; tout glissement sur le chemin critique → fiche problématique avec options (paralléliser, réduire le périmètre, décaler).
4. Distinguer ce qui dépend de l'équipe et ce qui dépend de tiers (institutions, partenaires) : ces derniers portent une incertitude plus forte, à afficher.
5. Présenter en format lisible sur téléphone (liste des 5 prochains jalons + blocages) et en diagramme (Mermaid gantt) dans le fichier.

## Exemple [FICTIF]
```
Chemin critique vague 1 [FICTIF] :
Avis juridique (fin prévue 15/11) → Critères de recrutement (+1 sem.) → Recrutement 10 médecins (+8 sem.) → Ouverture (31/01)
Marge : 0 jour. Glissement de l'avis juridique de 2 semaines → ouverture au 14/02 sauf option « médecins inscrits au Gabon d'abord ».
```

## Limites et interdits
- Ne jamais présenter une date dépendant d'un tiers comme certaine.
- Ne jamais engager de ressources ou décider d'un changement de périmètre : proposer.
- Ne jamais inclure de nom de personne : des rôles.

## Sources
- PMI, *PMBOK Guide* 7e éd. (domaine « Planification ») ; méthode du chemin critique (Kelley & Walker, 1959).
- Mermaid, diagrammes de Gantt — https://mermaid.js.org/syntax/gantt.html
