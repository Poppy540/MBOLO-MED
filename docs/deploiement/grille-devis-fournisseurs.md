# Grille de comparaison des devis — hébergement, paiement, SMS

> **À remplir par le porteur de projet** avec les réponses écrites des fournisseurs. Préparée par l'Agent 6 le 2026-09-28 à partir des ADR. Les montants et conditions sont ceux des devis reçus, jamais des estimations. Aucun identifiant de compte, clé d'API ou contact nominatif dans ce fichier.
>
> Notation par critère : ✅ conforme · ⚠️ partiel ou à négocier · ❌ non conforme · ? non répondu. Un ❌ sur un critère **éliminatoire** (★) écarte l'offre.

## 1. Hébergement des données de santé (ADR-0004, ADR-0015, ADR-0016)

Candidats : OVHcloud HDS (retenu sous réserve), un hébergeur au Gabon si la loi l'impose (D-0003, question n°3).

| Critère | Pourquoi | Offre A | Offre B |
|---|---|---|---|
| ★ Certification exigée par la loi (HDS en France, équivalent au Gabon) | ADR-0004, D-0003 | | |
| ★ Localisation des données conforme à l'avis juridique | D-0003 | | |
| ★ Clauses : non-réutilisation des données, notification des violations, audit, réversibilité | ADR-0004 | | |
| Kubernetes ou conteneurs gérés | services de la plateforme | | |
| PostgreSQL 16 géré, sauvegardes chiffrées, restauration testée | ADR-0013 | | |
| Stockage objet compatible S3, chiffré | ADR-0015 | | |
| ★ KMS : clé maître dans un module matériel, API par certificat client, journal des appels | ADR-0016 (A) | | |
| Hébergement de Loki, Prometheus, OnCall (ou équivalent) dans la même zone | ADR-0016 (B) | | |
| Latence vers Libreville (serveur vidéo LiveKit) | ADR-0011 | | |
| Engagement de disponibilité (SLA) et astreinte de l'hébergeur | exploitation | | |
| Prix mensuel (production + recette), frais de sortie | business plan | | |

## 2. Paiement mobile money (ADR-0017)

Candidats relevés : pawaPay, SingPay, intégration directe Airtel Money et Moov Money.

| Critère (ordre de l'ADR-0017) | Offre A | Offre B | Offre C |
|---|---|---|---|
| ★ Airtel Money **et** Moov Money au Gabon, **en production** | | | |
| ★ Notifications de paiement **signées** et API de lecture du statut | | | |
| ★ Remboursement d'une collecte, vers le portefeuille qui a payé (pas de versement libre) | | | |
| Bac à sable complet (accepté, refusé, expiré) | | | |
| Frais par transaction (collecte, remboursement) | | | |
| Délai de reversement sur le compte de Mbolo Santé | | | |
| Contrat et KYC exigés (documents, délais) | | | |
| Autres pays couverts (export) | | | |
| Lieu de traitement des données du payeur ; sous-traitance (RGPD, loi n°001/2011) | | | |
| Clé d'idempotence fournie par le marchand (identifiant de tentative) | | | |

## 3. SMS et WhatsApp (ADR-0012)

| Critère | Offre A | Offre B |
|---|---|---|
| ★ Livraison vers Airtel et Moov au Gabon, taux de délivrance annoncé | | |
| Nom d'expéditeur « Mbolo Santé » (sender ID) autorisé | | |
| WhatsApp Business : gabarits approuvés, coût par conversation | | |
| Accusés de réception | | |
| ★ Le fournisseur ne réutilise pas les numéros ni les textes ; durée de conservation | | |
| Envoi programmable (pas d'envoi la nuit) | | |
| Prix par SMS au Gabon, volumes | | |
| Autres pays couverts (export) | | |

## 4. Synthèse et choix

| Domaine | Offre retenue | Raison | Date | Décision |
|---|---|---|---|---|
| Hébergement | | | | D-____ |
| Paiement | | | | D-____ |
| SMS / WhatsApp | | | | D-____ |

Après le choix : ajouter les coûts au tableur du business plan (qui fait foi), mettre à jour l'inventaire des secrets (`secrets/inventaire-cles.md`) et le registre des traitements (sous-traitants).

Sources : ADR-0004, 0011, 0012, 0013, 0015, 0016, 0017 ; D-0002.
