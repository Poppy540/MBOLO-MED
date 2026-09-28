# ADR-0020 — Facturation : encaissement centralisé, reçus, reversements et abonnements

- **Date :** 2026-09-28
- **Statut :** proposée — **modèle centralisé retenu par le porteur de projet (2026-09-28)** ; structure juridique, fiscalité et mentions à valider par le juriste et le comptable (voir « Questions »)
- **Décideurs :** porteur de projet ; juriste ; comptable (à désigner)

## Contexte

L'ADR-0017 couvre l'**encaissement** d'une consultation par mobile money : prix fixé par le serveur, rendez-vous confirmé une fois le paiement relu chez le prestataire, remboursement validé par un humain. Il manque tout ce qui suit l'encaissement :

- le **reçu** remis au patient ;
- le **reversement** aux professionnels (hypothèse du business plan : 55 % du prix de la consultation) ;
- les **abonnements** : Diaspora « Famille » (25 €/mois, par carte) et partenariat pharmacie (50 000 FCFA/mois) ;
- l'**export comptable** et le suivi des recettes face au business plan (le tableur fait foi).

Le porteur de projet a choisi, le 2026-09-28, que **la plateforme centralise les paiements et les redistribue**, sauf les médicaments.

Contraintes :

- **aucune donnée de santé** dans la facturation : ni motif, ni spécialité révélatrice, ni diagnostic (libellé neutre « Consultation Mbolo Santé ») ;
- **l'humain décide** des sorties d'argent (principe n°7) : aucun reversement ni remboursement sans validation par une personne habilitée ; jamais un agent IA ;
- **export** : devises, taxes, mentions et numérotation propres à chaque pays, jamais codées en dur ;
- les professionnels peuvent exercer **hors du Gabon** (D-0001) : reversement possible par virement international.

## Options envisagées

1. **Paiement direct à chaque intervenant** : le patient paie le médecin, l'infirmier, etc.
   - Avantage : la plateforme ne manipule pas l'argent des tiers.
   - Limites : pas de paiement garanti avant la consultation, remboursements difficiles, plusieurs paiements pour le patient ; médecin à l'étranger souvent incapable de recevoir un mobile money gabonais ; la plateforme doit réclamer sa part chaque mois (risque d'impayés) ; contraire au service de paiement déjà construit (ADR-0017).
2. **Encaissement centralisé, puis reversement** : un seul paiement du patient à Mbolo Santé, qui reverse la part de chaque intervenant.
   - Avantages : un paiement, un reçu, remboursement possible ; tout professionnel payable (mobile money ou virement) ; recettes de la plateforme assurées ; cohérent avec l'ADR-0017 et le business plan.
   - Limites : deux questions juridiques (partage d'honoraires, encaissement pour compte de tiers), à traiter ci-dessous.
3. **Mixte** : encaissement centralisé pour les actes réalisés via la plateforme, paiement direct pour les médicaments.

## Décision proposée : option 3

### 1. Qui paie quoi, et à qui

| Flux                                                     | Payeur                     | Receveur                                                   | Moyen                                            |
| -------------------------------------------------------- | -------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| Téléconsultation, acte au point de consultation assistée | Patient (ou proche payeur) | **Mbolo Santé**, puis reversement aux intervenants         | Mobile money (ADR-0017) ; carte pour la diaspora |
| Médicaments                                              | Patient                    | **La pharmacie choisie, directement** — jamais Mbolo Santé | Au comptoir                                      |
| Abonnement Diaspora « Famille »                          | Proche de la diaspora      | Mbolo Santé                                                | Carte (prestataire à choisir)                    |
| Partenariat pharmacie                                    | Pharmacie                  | Mbolo Santé                                                | Virement ou mobile money, sur facture mensuelle  |

### 2. Structure juridique proposée (à valider par le juriste)

Beaucoup de codes de déontologie médicale interdisent au médecin de **partager ses honoraires** avec une entreprise non médicale. Plutôt qu'une commission prélevée sur les honoraires, il est proposé :

- que Mbolo Santé **encaisse les honoraires au nom et pour le compte du professionnel** (mandat d'encaissement dans son contrat) et les lui **reverse intégralement** ;
- que Mbolo Santé facture **séparément ses frais de service** (au patient, au professionnel, ou aux deux).

Le montant payé peut rester celui du business plan. **Exemple indicatif, non validé** : consultation de médecine générale à 10 000 FCFA = honoraires 5 500 FCFA (55 %) + frais de service 4 500 FCFA. Le reçu montre les deux lignes.

Pour **encaisser pour le compte de tiers**, la zone CEMAC peut exiger un agrément d'établissement de paiement (BEAC/COBAC). Proposé : passer par un **agrégateur déjà agréé** qui sait répartir les paiements (critère à ajouter à la grille des devis), plutôt que de demander un agrément propre.

### 3. Reçu du patient

- Émis **à chaque paiement reçu**, et un avoir à chaque remboursement.
- **Numérotation continue, sans trou**, par pays et par année (ex. `GA-2026-000001` [FICTIF]), attribuée sous verrou.
- Contenu : émetteur (mentions légales du pays), date, montant et devise, ventilation honoraires / frais de service, taxes éventuelles, référence opaque du rendez-vous, moyen de paiement (opérateur, jamais le numéro).
- **Sans donnée de santé** : libellé neutre, pas de spécialité. Le nom du professionnel n'y figure **que si le juriste l'exige** (le nom d'un spécialiste peut révéler une pathologie).
- Consultable et téléchargeable par le patient dans l'application ; conservé selon la durée légale (à confirmer) ; données dans la base du service de paiement (pas dans le dossier médical).

### 4. Relevés et reversements aux intervenants

- **Relevé mensuel** par intervenant (médecin, infirmier du point de consultation, interprète) : consultations payées (références opaques), montants, remboursements déjà imputés, total à reverser.
- **Aucun versement automatique** : chaque relevé est **validé par une personne habilitée** (nouveau rôle `validation-reversement`, double authentification, jamais un agent IA, jamais le bénéficiaire lui-même), puis versé par l'agrégateur (mobile money) ou par virement (professionnel à l'étranger), avec une clé d'idempotence.
- Un remboursement survenu **après** un reversement est déduit du relevé suivant.
- Seuil minimal de versement et retenues fiscales éventuelles : à fixer (comptable).
- Coordonnées de versement du professionnel : saisies et **vérifiées par un humain**, chiffrées, jamais journalisées ; toute modification déclenche une alerte et une nouvelle vérification (fraude classique : détournement du compte de versement).

### 5. Abonnements

- **Diaspora « Famille »** (vague 2) : payé par carte par un proche, lié à un patient (ADR-0019). **Contenu à définir** (nombre de consultations incluses ? proches couverts ?). Prestataire de carte à choisir ; renouvellement mensuel, résiliation à tout moment, reçu à chaque échéance.
- **Pharmacie** : facture mensuelle numérotée ; en cas d'impayé, la suspension du partenariat est **décidée par un humain**, jamais automatique.

### 6. Comptabilité et pilotage

- **Export mensuel** pour le comptable (reçus, avoirs, reversements, abonnements, frais du prestataire), sans donnée de santé.
- **Rapprochement** avec les relevés de l'agrégateur (déjà prévu pour les paiements, ADR-0017).
- Tableau de bord **recettes réelles / business plan** pour le porteur de projet (sous-agent `pilote-projet`, skill `suivi-budget-business-plan`) ; il ne modifie jamais le tableur.

### 7. Déploiement

Derrière des flags désactivés par défaut : `facturation.recus`, `reversements.professionnels`, `abonnement.diaspora`, `abonnement.pharmacie`.

## Conséquences

- **Code**, en petites PR, après les réponses aux questions :
  1. reçus et avoirs du patient (numérotation sous verrou, écran « Mes reçus ») ;
  2. relevés et reversements (rôle `validation-reversement`, coordonnées de versement vérifiées) ;
  3. export comptable ;
  4. abonnement pharmacie ;
  5. abonnement Diaspora « Famille » (après le choix du prestataire de carte).
- **Grille des devis** (`docs/deploiement/grille-devis-fournisseurs.md`) : ajouter les critères « répartition des paiements / reversements », « agrément de l'agrégateur », « virements internationaux », « paiement par carte ».
- **Sécurité** : modèle de menaces (détournement des coordonnées de versement, reversement en double, faux remboursement) ; séparation des rôles préparation / validation.
- **Registre des traitements** : T4 étendu (reçus, reversements, coordonnées de versement des professionnels, abonnements).

## Suivi

- **Reçus et avoirs** (PR BO, flag `facturation.recus`) : un reçu à chaque paiement confirmé, un avoir à chaque remboursement versé. Numérotation sans trou par pays et par année du pays, sous verrou. `GET /recus` réservé au patient lui-même. Sans ventilation, sans taxes ni mentions définitives (`valeurFiscale: false`) en attendant les réponses 1, 3, 5 et 11. Reste : l'écran « Mes reçus » de l'application patient.

## Questions

**Pour le juriste**

1. Le schéma « honoraires encaissés sur mandat + frais de service séparés » évite-t-il le **partage d'honoraires** interdit par le code de déontologie gabonais ? Faut-il l'accord de l'Ordre des médecins ?
2. Encaisser pour le compte des professionnels exige-t-il un **agrément d'établissement de paiement** (BEAC/COBAC), ou l'agrégateur agréé suffit-il ?
3. **Mentions obligatoires** d'un reçu ou d'une facture ; le **nom du professionnel** doit-il y figurer ?
4. **Durée de conservation** des reçus et relevés.

**Pour le comptable** 5. **TVA** et impôts : honoraires médicaux exonérés ? frais de service taxables ? abonnements ? 6. **Retenue à la source** pour un professionnel exerçant à l'étranger ; conventions fiscales. 7. Format de l'**export** et plan de comptes.

**Pour le porteur de projet** 8. **Fréquence** des reversements (mensuelle proposée) et **seuil** minimal. 9. Qui reçoit le rôle **`validation-reversement`** ? 10. **Contenu** de l'abonnement Diaspora « Famille ». 11. Frais de service facturés **au patient, au professionnel, ou partagés** ?

Sources :

- ADR-0017 (paiement mobile money), ADR-0019 (proches), D-0001 (hypothèses économiques), `docs/business-plan/README.md` ;
- `docs/deploiement/grille-devis-fournisseurs.md` ; D-0003 (avis juridique, brouillon).
