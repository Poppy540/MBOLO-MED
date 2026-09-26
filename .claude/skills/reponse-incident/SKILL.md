---
name: reponse-incident
description: Prépare et coordonne côté salle de contrôle la réponse aux incidents de sécurité et de données de Mbolo Santé — qualification et gravité, alerte immédiate des bons humains, actions de confinement proposées, collecte des éléments, chronologie, évaluation des obligations de notification, retour d'expérience — selon docs/securite/plan-incident.md, sans jamais agir soi-même en production. À utiliser dès qu'un incident de sécurité ou de données est détecté ou suspecté, pendant sa gestion, et pour les exercices sur table.
metadata:
  agent: pilote-securite
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Réponse aux incidents

## Phases (NIST SP 800-61)
1. **Préparation** : plan (`docs/securite/plan-incident.md`), contacts d'astreinte (rôles), procédures de révocation, exercices sur table trimestriels.
2. **Détection et qualification** : quoi, depuis quand, quel périmètre, données de santé concernées ? Gravité (critique / élevée / moyenne / faible) ; **dans le doute, la plus haute**.
3. **Alerte** : immédiate pour critique et élevée — responsable sécurité (données), directeur médical de garde (si impact patient), porteur de projet toujours.
4. **Confinement** (actions **proposées** aux humains, jamais exécutées par l'agent) : révoquer une clé, désactiver un flag, isoler un service, suspendre un agent IA (bascule vers un humain), bloquer un compte.
5. **Éradication et rétablissement** : correctif, vérification, remise en service contrôlée.
6. **Notification** : évaluer avec le DPO et le juriste — autorité gabonaise (à confirmer), autorité UE sous 72 h si le RGPD s'applique (art. 33), personnes concernées si risque élevé (art. 34), partenaires contractuels.
7. **Retour d'expérience** sans recherche de coupable : causes, mesures, nouveaux tests ; `memory.md` (leçons apprises), fiche problématique, registre des risques.

## Journal d'incident (à tenir en temps réel)
`control-room/incidents/INC-AAAA-NNN.md` (à créer au premier incident) : horodatage, événement, décision, qui (rôle), preuve. Aucune donnée nominative ni secret.

## Cas propres aux agents IA
- Agent qui donne un conseil médical, divulgue des données ou agit hors périmètre → proposer la **suspension de l'agent** (bascule vers un humain) par le responsable habilité, conserver les conversations pseudonymisées concernées, informer l'Agent 4.

## Exemple [FICTIF]
> 10:02 — alerte : export anormal de 300 Observations par un compte professionnel [FICTIF]. 10:04 — gravité critique, alerte responsable sécurité + porteur de projet. 10:06 — proposition : suspendre le compte et révoquer ses jetons (action humaine à 10:09). 10:30 — périmètre : 300 ressources de 41 patients fictifs. Évaluation des notifications lancée avec le DPO.

## Limites et interdits
- Ne jamais retarder l'alerte pour compléter l'analyse.
- Ne jamais agir soi-même en production (révocation, blocage, bascule) : proposer, l'humain agit.
- Ne jamais contacter une autorité, un partenaire, la presse ou les personnes concernées : préparer les brouillons pour les humains.
- Ne jamais effacer ou modifier des journaux ou des preuves.

## Sources
- NIST SP 800-61 Rev. 3, *Incident Response Recommendations and Considerations for Cybersecurity Risk Management* (2025) — https://doi.org/10.6028/NIST.SP.800-61r3
- ENISA, *Good practice guide for incident management*.
- RGPD art. 33-34 ; CEPD, *Guidelines 9/2022 on personal data breach notification*.
- ISO/IEC 27035-1:2023.
