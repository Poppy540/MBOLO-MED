# ADR-0017 — Paiement des consultations par mobile money

- **Date :** 2026-09-28
- **Statut :** proposée (à valider par le porteur de projet ; fournisseur à choisir après devis)
- **Décideurs :** porteur de projet, responsable sécurité (à nommer)

## Contexte

Une consultation de la vague 1 va aujourd'hui de l'invitation au compte-rendu signé, mais elle n'est pas payée. D-0001 prévoit :
- **mobile money (Airtel Money, Moov Money) au Gabon**, carte bancaire pour la diaspora (vague 2) ;
- prix de référence : médecine générale 10 000 FCFA, consultation spécialisée 15 000 FCFA (le tableur du business plan fait foi) ;
- 55 % reversés au professionnel.

Le service `paiement` est prévu (`platform/services/paiement`, vide) ainsi que le flag `paiement.mobile-money` (désactivé, non branché). Les clés de l'agrégateur sont inventoriées (`MOBILE_MONEY_AGGREGATOR_*`, `MOBILE_MONEY_WEBHOOK_SIGNING_SECRET`), avec la portée « collecte uniquement ».

Contraintes :
- **aucune donnée de santé chez le prestataire de paiement** (principe n°3) : ni spécialité (une « consultation de psychiatrie » sur un relevé révèle une information de santé), ni motif, ni nom du professionnel ;
- le payeur n'est pas toujours le patient : un proche ou un aidant peut payer depuis son téléphone ;
- exportable : la devise, les prix, les opérateurs et le prestataire changent d'un pays à l'autre, rien n'est codé en dur ;
- sécurité des patients : une **urgence n'attend jamais un paiement** (orientation immédiate vers les secours, principe n°2) ;
- un agent IA ne déclenche jamais un paiement ni un remboursement (principe n°7) ;
- faible débit : le patient valide sur son téléphone (code secret du portefeuille, USSD), l'application attend le résultat sans recharger la page.

## Options envisagées

Informations publiques relevées le 2026-09-28, **toutes à confirmer par écrit auprès de chaque prestataire** (couverture, frais, contrat, bac à sable).

1. **Agrégateur panafricain (ex. pawaPay)** :
   - annonce être en service au Gabon avec Airtel Money (très majoritaire), Moov Money annoncé ;
   - collecte et décaissement (utile plus tard pour reverser leur part aux professionnels) ;
   - un seul contrat et une seule intégration pour d'autres pays : favorable à l'export ;
   - reste à vérifier : Moov effectif, frais, notifications signées, bac à sable, exigences KYC.
2. **Agrégateur gabonais (ex. SingPay)** :
   - collecte marchande inter-opérateurs (Airtel et Moov) ;
   - interlocuteur local ;
   - limité au Gabon : un autre prestataire par pays pour l'export.
3. **Intégration directe des opérateurs (API Airtel Money, marchand Moov Money)** :
   - frais annoncés plus bas (de l'ordre de 1,5 à 2 % pour Airtel, source non officielle) ;
   - deux contrats, deux intégrations, deux formats de notification, à refaire dans chaque pays ;
   - plus de secrets à garder (`AIRTEL_MONEY_*`, `MOOV_MONEY_*`).
4. **Interopérabilité CEMAC (GIMACPAY)** :
   - passe par une banque ou un prestataire agréé, pas une API ouverte à un marchand ;
   - à suivre pour plus tard, pas pour la vague 1.

Les cartes des agrégateurs internationaux (Flutterwave, CinetPay…) ne confirment pas clairement Airtel et Moov au Gabon : écartés à ce stade.

## Décision proposée

### Prestataire
- **Un agrégateur (option 1 ou 2), choisi par le porteur de projet sur devis** selon ces critères, dans cet ordre :
  1. Airtel **et** Moov au Gabon, en production (pas seulement annoncés) ;
  2. notifications de paiement **signées** et API de consultation du statut ;
  3. bac à sable complet (paiement accepté, refusé, expiré) ;
  4. frais, délai de reversement sur le compte de Mbolo Santé, contrat et KYC ;
  5. autres pays couverts (export) ;
  6. conformité : lieu de traitement des données du payeur, sous-traitance au sens du RGPD et de la loi n°001/2011.
- Le code ne dépend pas de ce choix : une **interface `Fournisseur`** (initier une collecte, lire son statut, vérifier une notification) ; un **fournisseur simulé** en développement et en tests, refusé au démarrage en production (même règle que le canal simulé des notifications, ADR-0012).

### Parcours
1. Le patient choisit un créneau : le créneau est **retenu 15 minutes** (paramétrable), le rendez-vous est « en attente de paiement ».
2. Il saisit le numéro du portefeuille qui paie (le sien ou celui d'un proche) et choisit l'opérateur.
3. Le service `paiement` demande la collecte au fournisseur, avec une **clé d'idempotence** (jamais deux débits pour un même rendez-vous).
4. Le payeur valide sur son téléphone ; l'application affiche « Validez le paiement sur votre téléphone » et interroge le statut à intervalle court.
5. Paiement confirmé → rendez-vous confirmé. Refusé ou expiré → le créneau est libéré, le patient peut réessayer.

Règles :
- **Un paiement n'est confirmé que par le serveur** : notification signée **et** relecture du statut chez le fournisseur. Jamais sur la parole du navigateur.
- **Libellé chez le prestataire : « Consultation Mbolo Santé » et une référence opaque**, jamais la spécialité, le professionnel ni le patient.
- **Numéro du payeur** : transmis au fournisseur, **ni stocké ni journalisé** par Mbolo Santé (seuls les 2 derniers chiffres peuvent être affichés au patient pendant l'attente).
- **Montant fixé par le serveur** depuis une grille de prix par pays et par type de consultation (devise ISO 4217, ex. `XAF`, en unités entières), jamais envoyé par le navigateur.
- **Remboursement** (annulation par le professionnel, consultation non tenue) : préparé par le service, **validé par un humain** (rôle à créer, avec MFA) ; jamais automatique en vague 1, jamais décidé par un agent IA.
- **Urgence** : le parcours d'orientation vers les secours ne passe jamais par le paiement.

### Données et sécurité
- Schéma PostgreSQL `paiement`, rôle `mbolo_paiement` sans suppression (ADR-0013) : référence du rendez-vous, montant, devise, opérateur, statut, référence du fournisseur, horodatages. **Aucune donnée de santé, aucun numéro de téléphone.**
- Le dossier FHIR ne reçoit rien du paiement ; le service `teleconsultation` lit seulement « payé / non payé » pour un rendez-vous.
- Notifications du fournisseur : signature vérifiée en temps constant, horodatage contrôlé (rejeu refusé), limites d'appels, adresse d'origine vérifiée si le fournisseur la publie.
- Agent 2 : **statut seulement** (`PAYMENT_STATUS_READONLY_TOKEN_AGENT02`), ni montant détaillé ni moyen de paiement.
- Alertes (ADR-0016) : taux d'échec anormal, notifications à signature invalide, écart entre notre statut et celui du fournisseur (rapprochement quotidien).
- Flag `paiement.mobile-money` : désactivé, la réservation reste gratuite (cohorte pilote) ; activé, la confirmation d'un rendez-vous exige un paiement confirmé.

## Conséquences

- **Code**, en petites PR :
  1. service `paiement` : grille de prix, fournisseur simulé, schéma, API de collecte et de statut, notifications signées ;
  2. branchement au rendez-vous (créneau retenu, confirmation, libération) derrière `paiement.mobile-money` ;
  3. écran de paiement dans l'application patient (faible débit, texte court, pictogrammes) ;
  4. rapprochement quotidien et remboursement validé par un humain ;
  5. vrai fournisseur, après signature du contrat.
- **Inventaire des secrets** : clés de l'agrégateur choisi ; les clés `AIRTEL_MONEY_*` et `MOOV_MONEY_*` ne servent que si l'option 3 est retenue.
- **Registre des traitements** : nouveau traitement « paiement des consultations » (payeur, montant, statut), prestataire en sous-traitant.
- **Comptabilité** : reçu sans donnée de santé ; reversement des 55 % aux professionnels traité à part (décaissement, fiscalité, pays du professionnel).
- **Risques** :
  - prestataire indisponible : la réservation payante est bloquée, les consultations déjà payées ne le sont pas ;
  - notification perdue : le rapprochement la rattrape ;
  - fraude au remboursement : validation humaine, jamais par le demandeur lui-même.

## Suivi

- **Service `paiement`** (PR AQ) : grille de prix par pays, interface `Fournisseur` et fournisseur simulé, collecte par le patient seul, confirmation relue chez le prestataire, notifications signées.
- **Branchement au rendez-vous** (PR AR) : rendez-vous « à payer » (`pending`) qui retient le créneau, confirmation après paiement, annulation par la plateforme (code `plateforme`) à la fin du délai, créneau rendu ; scénarios de bout en bout avec le payeur simulé.

## Reste à décider (porteur de projet)

1. Demander les devis et choisir le prestataire (critères ci-dessus).
2. Vague 1 : cohorte pilote gratuite, ou payante dès le début ?
3. Grille de prix au Gabon (tableur du business plan) ; tarif réduit ou gratuité pour certains cas ?
4. Délai de rétention du créneau (15 minutes proposées).
5. Règles de remboursement et titulaires du rôle qui les valide.
6. Reversement aux professionnels : fréquence, moyen, pays (décision distincte, plus tard).

Sources (consultées le 2026-09-28, à confirmer auprès des prestataires) :
- [pawaPay — en service au Gabon](https://www.pawapay.io/blog/pawapay-live-in-gabon)
- [SingPay](https://www.singpay.ga/)
- [Moov Money Gabon](https://moovmoney.ga/)
- [Intégrer Airtel Money au Gabon (Kolonell, 2026)](https://kolonell.com/fr/blog/integrer-airtel-money-site-web-gabon-libreville-2026)
- [MA DIGIPAIE (interopérabilité CEMAC)](https://www.madigipaie.com/)
- [Flutterwave — moyens de paiement mobile money](https://flutterwave.com/ci/support/payment-methods/pay-with-mobile-money)
- [Guide mobile money Gabon 2026 (Atekbot)](https://www.atekbot.space/blog/gabon-mobile-money-gabon-guide-2026)
- D-0001 ; ADR-0012, ADR-0013, ADR-0016 ; `secrets/inventaire-cles.md` ; `docs/deploiement/flags.md` ; principes n°2, n°3 et n°7 de `CLAUDE.md`.
