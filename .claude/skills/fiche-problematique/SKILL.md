---
name: fiche-problematique
description: Rédige une fiche problématique au format obligatoire de Mbolo Santé (identification et gravité, constat chiffré et cause, impact patients/professionnels/budget/planning, deux ou trois options chiffrées avec délais et limites, recommandation argumentée et sourcée, décision attendue avec date limite) pour tout problème qui demande une décision du porteur de projet. À utiliser dès qu'un sous-agent pilote remonte un problème, qu'un indicateur sort de sa cible, qu'un risque s'aggrave, ou que le porteur de projet demande « que proposes-tu pour… ».
metadata:
  agent: pilote-orchestrateur
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Fiche problématique

## Pourquoi ce format
Le porteur de projet doit pouvoir **décider en quelques minutes** avec des informations fiables. Une fiche n'est pas un rapport : c'est une **demande de décision** préparée. Le format est fixé par `control-room/fiches/_modele.md` ; ne pas le modifier.

## Quand ouvrir une fiche
- Un problème qui demande une **décision** (arbitrage, budget, priorité, risque accepté).
- Un indicateur hors cible pendant la durée définie, un risque dont la criticité augmente, un incident clos qui appelle une mesure structurelle.
- **Pas** pour une information simple (→ brief) ni pour une alerte immédiate (→ alerte d'abord, fiche ensuite).

## Étapes
1. **Numéroter** : `FP-AAAA-NNN` (séquence annuelle, vérifier la dernière fiche dans `control-room/fiches/`).
2. **Gravité** :
   - **Critique** : risque pour la sécurité d'un patient ou fuite de données possible ; blocage d'une vague.
   - **Élevée** : dégradation significative du service, risque juridique, écart budgétaire > 15 %.
   - **Moyenne** : dégradation limitée, retard d'une étape non critique.
   - **Faible** : amélioration.
3. **Constat chiffré** : quoi, combien, depuis quand, sur quel périmètre. Chaque chiffre a une **source** (fichier, tableau de bord, requête, date d'extraction). Séparer **faits** et **hypothèses** ; donner un niveau de confiance pour la cause.
4. **Impact** sur les quatre axes (patients, professionnels, budget, planning). « Aucun impact identifié » est une réponse valable ; « non évalué » doit être justifié.
5. **Options** : 2 ou 3 options **réellement différentes** (dont, si pertinent, « ne rien faire » avec ses conséquences). Pour chacune : description, coût (FCFA ou €, fourchette acceptée), délai, **limites honnêtes**.
6. **Recommandation** : option choisie, argumentation, données et sources. Règle : **une option qui dégrade la sécurité des patients ou la protection des données n'est jamais recommandée**, même si elle est moins chère ou plus rapide.
7. **Décision attendue** : question fermée, date limite réaliste, conséquence d'une absence de décision.
8. **Relecture** avant envoi : aucune donnée nominative ; aucun secret ; chiffres recoupés ; pas de jargon inutile ; lisible sur téléphone.
9. Enregistrer dans `control-room/fiches/`, citer la fiche dans le brief quotidien, mettre à jour le registre des risques si besoin (`registre-risques`).
10. Après décision : le porteur de projet (ou Claude Code sur sa demande) consigne la décision dans `control-room/decisions/` et `memory.md` ; la fiche passe en « Décidée », puis en « Close » et va dans `historique/` une fois les actions faites.

## Exemple [FICTIF] (extrait)
```
# FP-2026-012 — Échecs de connexion vidéo en province
Gravité : Élevée · Domaine : Exploitation · Vague : 1
Constat : 31 % des téléconsultations hors Libreville échouent en vidéo (212/684, 01–30/09) contre 7 % à Libreville.
Source : tableau de bord SLO « teleconsultation » [FICTIF], extraction 2026-10-01.
Cause (confiance moyenne) : débit < 300 kbit/s sur 60 % des sessions échouées.
Options :
 A — Audio par défaut hors Libreville (coût ~0, délai 1 sem., limite : pas d'examen visuel)
 B — Serveur média plus proche (coût ~X FCFA/mois, délai 6 sem., limite : gain incertain)
 C — Ne rien faire (limite : 1 patient sur 3 en province mal servi)
Recommandation : A immédiatement puis mesure de B ; sources : SLO, tests terrain FICTIF-T3.
Décision attendue : valider A avant le 2026-10-08.
```

## Limites et interdits
- Ne jamais inclure de donnée nominative (patient, professionnel) ni de secret.
- Ne jamais présenter une hypothèse comme un fait, ni un chiffre sans source.
- Ne jamais recommander une option qui dégrade la sécurité des patients ou des données.
- Ne jamais consigner soi-même une décision du porteur de projet sans sa demande explicite.
- Ne jamais retarder une alerte sous prétexte de préparer la fiche.

## Sources
- Rapport « A3 » de résolution de problème (Lean, Toyota) : constat, cause, contre-mesures.
- Méthode des « 5 pourquoi » et diagramme d'Ishikawa pour l'analyse de cause.
- Minto B., *The Pyramid Principle* : recommandation d'abord, arguments ensuite.
- Nygard M., « Documenting Architecture Decisions » (2011) : traçabilité des décisions.
