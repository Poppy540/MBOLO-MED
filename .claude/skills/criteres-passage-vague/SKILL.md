---
name: criteres-passage-vague
description: Prépare le dossier de passage de vague de Mbolo Santé — vérifie un par un les critères de docs/deploiement/vagues.md avec preuves (juridique, médical, sécurité, qualité, technique, économique, humain), vérifie que tous les skills utilisés par les fonctions à activer sont en statut complet avec au moins 3 cas de test au vert dont un refus ou une escalade, et formule une recommandation pour la décision du porteur de projet. À utiliser avant toute proposition de passage de vague, d'ouverture d'une ville ou d'une spécialité, et lors des revues mensuelles.
metadata:
  agent: pilote-projet
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Critères de passage de vague

## Dossier de passage (`control-room/passages-de-vague/vague-N-AAAA-MM-JJ.md`)
1. **Périmètre demandé** : fonctions, villes, spécialités, types d'utilisateurs, flags concernés.
2. **Critères** de `docs/deploiement/vagues.md` : tableau critère / cible / réel / preuve (lien, date) / statut (✅ rempli · ❌ non rempli · ⚠️ partiel ou non vérifiable).
3. **Skills et cas de test** (règle option C, D-0001) — tableau généré en lisant les frontmatters :

| Agent | Skill | Utilisé par une fonction à activer ? | Statut | Cas (réel / exigé) | Dont refus/escalade | Au vert ? |
|---|---|---|---|---|---|---|

   Pour chaque skill utilisé : statut **`complet`**, **≥ 3 cas**, ≥ 1 refus ou escalade, **100 % au vert** sur la dernière exécution (`evaluation-agents-ia-medicaux`). Skills cliniques : validation du comité médical **signée**.
4. **Sécurité** : vulnérabilités critiques/hautes ouvertes (0 exigé), AIPD, test d'intrusion, plan d'incident testé.
5. **Qualité** : parcours `@critique` au vert ; tests terrain ; biais.
6. **Exploitation** : SLO en recette, retour arrière testé, astreintes.
7. **Humain** : rôles clés nommés (directeur médical, responsable sécurité, DPO) et suppléants ; professionnels vérifiés en nombre suffisant.
8. **Économie** : budget de la vague disponible.
9. **Recommandation** : passer / ne pas passer / passer sur un périmètre réduit — avec raisons. **Un seul critère de sécurité patient ou de données non rempli = ne pas passer.**
10. **Décision** : réservée au porteur de projet ; consignée dans `control-room/decisions/`.

## Méthode de vérification des skills
Lire le frontmatter de chaque `SKILL.md` (`metadata.statut`, `metadata.cas-de-test`) et compter les cas (`## Cas NN`) dans le fichier d'évaluation correspondant ; recouper avec le dernier rapport d'évaluation. **Le compteur du frontmatter ne suffit pas** : compter les cas réels.

## Exemple [FICTIF]
> Vague 2 demandée [FICTIF] : 21 critères — 17 ✅, 3 ❌ (validité des ordonnances non confirmée ; 5 skills de l'Agent 2 en v1 avec 1 cas ; circuit de pharmacovigilance non défini), 1 ⚠️. Recommandation : **ne pas passer** ; option : ouvrir les points assistés sans ordonnance électronique (périmètre réduit).

## Limites et interdits
- Ne jamais marquer un critère rempli sans preuve datée.
- Ne jamais recommander le passage si un skill utilisé n'a pas ses 3 cas au vert, ou si un critère de sécurité n'est pas rempli.
- Ne jamais activer une vague ou un flag : décision et action humaines.

## Sources
- `docs/deploiement/vagues.md` ; D-0001 (option C).
- Stage-gate (Cooper R.G., « Stage-Gate Systems: A New Tool for Managing New Products », *Business Horizons* 1990).
- OMS, *Monitoring and evaluating digital health interventions* (2016) — https://www.who.int/publications/i/item/9789241511766
