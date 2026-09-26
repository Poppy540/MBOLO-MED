---
name: conformite-prospection-rgpd
description: Vérifie et fait respecter les règles de protection des données dans la prospection des professionnels — base légale, information des personnes, droit d'opposition et désinscription, durée de conservation, minimisation — selon le RGPD pour les prospects européens et la loi gabonaise n°001/2011. À utiliser avant toute création de fiche prospect, avant toute campagne, et lors des purges périodiques du CRM.
metadata:
  agent: agent-03-recrutement
  statut: v1
  vague: "1"
  cas-de-test: "1/3"
---

> **Version 1** — durées et bases légales à valider par le DPO.

# Conformité de la prospection (RGPD et droit gabonais)

## Règles
- **Base légale** : intérêt légitime pour une prospection professionnelle ciblée (à valider par le DPO), ou consentement pour les candidatures spontanées.
- **Information** : au premier contact (fait par un humain), indiquer la source des données, la finalité, les droits, et un lien de désinscription (RGPD art. 14).
- **Opposition** : toute demande de désinscription est appliquée immédiatement ; la personne passe sur une liste d'opposition (données minimales pour ne plus la contacter).
- **Conservation** : proposition à valider — prospect sans réponse : suppression 3 ans après le dernier contact ; candidat non retenu : 2 ans avec accord ; professionnel recruté : durée du contrat + obligations légales.
- **Minimisation** : aucune donnée de santé, aucune donnée sensible, aucune photo non nécessaire.

## Déroulé
1. À chaque création de fiche : source, date, base légale renseignées ; sinon pas de fiche.
2. Chaque mois : lister les fiches arrivant à échéance → proposer la purge à un humain.
3. Demande d'accès, de rectification ou d'effacement → `transferer_humain` (DPO) dans les délais légaux.

## Exemple [FICTIF]
> Fiche Dr Test AA [FICTIF] : source « association Test Diaspora [FICTIF], 2026-09-01 », base « intérêt légitime », dernier contact 2023-08-15 → échéance dépassée → proposition de purge.

## Limites et interdits
- Ne jamais créer de fiche sans source ni base légale.
- Ne jamais conserver une donnée au-delà de la durée validée, ni ignorer une désinscription.
- Ne jamais exporter massivement le CRM.

## Sources
- RGPD art. 5, 6, 12-21 ; CNIL, référentiel « gestion des activités commerciales » (durées de conservation des prospects) — https://www.cnil.fr/fr/referentiels-et-normes
- Loi gabonaise n°001/2011 relative à la protection des données à caractère personnel.
