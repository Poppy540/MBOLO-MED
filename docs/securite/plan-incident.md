# Plan de réponse aux incidents — Mbolo Santé

> Squelette (skill `reponse-incident`). À tester par un exercice sur table avant la vague 1.

## Gravité
| Niveau | Exemples | Délai d'alerte |
|---|---|---|
| **Critique** | Urgence patient mal orientée ; fuite de données de santé ; ordonnance altérée ; secret exposé | **Immédiat** |
| Élevé | Indisponibilité de la téléconsultation ; agent qui sort de son périmètre | < 1 h |
| Moyen | Dégradation de performance ; anomalie de paiement | < 24 h |

## Circuit d'alerte
- Sécurité patient → **directeur médical de garde** (+ porteur de projet informé).
- Sécurité des données → **responsable sécurité** (+ porteur de projet informé).
- L'Agent 6 alerte ; il ne retarde jamais une alerte ; il n'agit pas en production.
- Canal : Slack (`#alertes-patients`, `#alertes-securite`) **et** astreinte Grafana OnCall qui appelle ou envoie un SMS (ADR-0006). Une alerte critique ne dépend jamais du seul chat.

Destinataires par type d'alerte et délais d'escalade : [ADR-0016](../architecture/adr/0016-preparation-production.md) (rôles ; titulaires à désigner).

## Étapes
1. Détecter et qualifier. 2. Contenir (désactiver un flag, révoquer une clé — par un humain). 3. Éradiquer. 4. Rétablir. 5. Notifier (autorités, personnes concernées si requis). 6. Retour d'expérience → `memory.md` (leçons apprises) et fiche problématique.

## Scénario : fuite de photos d'identité (ADR-0015) — brouillon, à valider

**Signaux** : consultation anormale dans les traces (volume, horaires, vérificateur inhabituel) ; accès inconnu au stockage objet ou à la base ; clé maître ou clés du stockage exposées ; signalement d'un patient (historique des accès).

**Gravité** : critique. Alerte immédiate du responsable sécurité et du porteur de projet.

**Contenir** (décidé et fait par un humain) :
1. **Désactiver le flag `identite.photos`** : plus aucun nouvel envoi.
2. **Retirer le rôle `verification-identite`** au compte en cause, ou à tous, et révoquer ses sessions dans Keycloak.
3. **Changer les clés du stockage** (`STORAGE_*`) et, si la base est touchée, les mots de passe de la base.
4. **Si la clé maître est exposée** : configurer une nouvelle clé comme actuelle, lancer la commande de rotation du service `documents` (ré-enveloppement sans déchiffrer les photos, reprise possible), puis retirer l'ancienne. **Dernier recours** : détruire la clé maître dans le KMS (opération réservée à deux personnes), ce qui rend toutes les photos illisibles pour toujours. Les patients devront alors renvoyer leurs photos ; le résultat des vérifications déjà faites reste dans le dossier.

**Évaluer** : quelles photos, quels patients, depuis quand (traces `AuditEvent` de motif `verification-identite`, décisions du schéma `documents`, journaux du stockage).

**Notifier** (si requis, avec le juriste) : autorité de protection des données (Gabon : CNPDCP ; UE : autorité du pays) et **patients concernés**, en phrases simples, avec les mesures à prendre (vigilance sur l'usurpation d'identité) `[À CONFIRMER : délais légaux]`.

**Retour d'expérience** : fiche problématique, `memory.md`, mise à jour de l'[AIPD n°1](aipd-verification-identite.md) et du [modèle de menaces](modele-menaces.md).

## Contacts (à compléter — rôles, pas de données personnelles dans le dépôt)
Directeur médical de garde · Responsable sécurité · Porteur de projet · Hébergeur · Prestataires critiques.
