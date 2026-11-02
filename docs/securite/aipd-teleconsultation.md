# AIPD n°2 — Téléconsultation, périmètre de la vague 1 (AIPD générale) — BROUILLON v0.1

> **Brouillon à valider par le porteur de projet, le juriste, le DPO et, pour les risques cliniques, le comité médical, avant toute utilisation avec de vraies personnes.**
>
> - Préparé par l'Agent 6 le 2026-11-02 (critère 3 du [bilan de préparation n°2](../../control-room/passages-de-vague/vague-1-2026-11-02.md)).
> - Méthode inspirée du guide AIPD de la CNIL.
> - Les passages `[À CONFIRMER]` attendent l'avis juridique (D-0003) ; les passages `[À COMPLÉTER]` attendent une décision ou une désignation du porteur de projet.
> - Aucune donnée réelle : les exemples sont fictifs.
>
> **Pourquoi une AIPD :** données de santé traitées à grande échelle à terme, personnes vulnérables (malades, faible littératie, mineurs possibles), téléconsultation (technologie nouvelle pour les personnes concernées), transferts possibles hors du Gabon, et un agent IA dans le parcours si l'Agent 1 est retenu. Risque considéré comme **élevé**.

## 0. Périmètre

| Traitement du [registre](registre-traitements.md) | Dans cette AIPD | Remarque |
|---|---|---|
| T2 Téléconsultation (rendez-vous, vidéo, dossier, compte-rendu, partages) | ✅ cœur de l'analyse | Inclut les comptes patients (ADR-0021 à 0024) et les SMS (ADR-0012) |
| T4 Paiement | ✅ | Aucune donnée de santé ; risque surtout financier et d'inférence |
| T8 Invitations, proches | ✅ | Accès d'un tiers à des données de santé |
| T1 Accueil et orientation (Agent 1) | ⚠️ seulement **si l'Agent 1 est retenu** pour la vague 1 | Section 3.3 ; décision « avec ou sans Agent 1 » attendue |
| T6 Audit qualité (Agent 4) | ⚠️ si l'Agent 4 est actif | Conversations pseudonymisées |
| T9 Vérification d'identité des patients | Renvoi | Analysée dans l'[AIPD n°1](aipd-verification-identite.md) |
| T10 Vérification des professionnels | Renvoi | AIPD à évaluer (pièces des professionnels) |
| T3 Ordonnances, T5 Recrutement par l'Agent 3, T7 Académie | ❌ hors vague 1 | À analyser avant leur vague |

## 1. Description du traitement

**Finalité** : permettre à un patient invité, à Libreville, de consulter à distance un médecin généraliste vérifié, avec un dossier médical tenu par le professionnel et partagé seulement sur consentement.

**Personnes concernées** :
- patients invités (vague 1 : cohorte limitée, 100 places paramétrables) et leurs aidants ;
- proches invités par le patient (3 au plus) ;
- professionnels de santé vérifiés (dont certains exercent hors du Gabon) ;
- équipe de la plateforme : rôles humains habilités, toujours avec double authentification.

**Données** (aucune n'est demandée sans finalité écrite) :

| Catégorie | Exemples | Où |
|---|---|---|
| Identité | Nom, prénom, date de naissance, sexe facultatif, numéro d'assurance maladie ou provisoire | Dossier FHIR (`Patient`) |
| Contact | Numéro de téléphone (unique moyen de contact, pas d'e-mail) | Dossier FHIR (`Patient.telecom`) |
| Santé | Rendez-vous (sans motif), compte-rendu rédigé et signé par le professionnel, partages, accès | Dossier FHIR (`Appointment`, `Composition`, `Consent`, `AuditEvent`) |
| Données de la vidéo | Image et voix en direct | Serveur média LiveKit, **jamais enregistrées** par défaut |
| Connexion | Identifiant, mot de passe (Keycloak seul), code SMS, application d'authentification (en option) | Keycloak |
| Paiement | Référence opaque du rendez-vous, montant, opérateur, statut ; **numéro du payeur ni stocké ni journalisé** | Base `paiement` |
| Traces | Chaque accès au dossier (qui, quand, pourquoi), journaux techniques sans donnée de santé | Dossier FHIR, supervision |
| Si Agent 1 retenu | Échanges de l'accueil, résumé pré-consultation | Section 3.3 |

**Acteurs et accès** (refus par défaut, ADR-0009) :
- le **patient** voit son dossier, ses reçus et l'historique des accès ;
- le **professionnel** n'accède au dossier que pour son rendez-vous, avec la décision du service `identite`, sur consentement, et seulement si sa fiche est vérifiée et valable ;
- le **proche** ne voit que les ordonnances et la « conduite à tenir » ;
- l'**équipe** accède seulement par rôle, toujours tracé :
  - `verification-identite`, `assistance-patient`, `validation-remboursement`, `revue-acces`, etc. ;
  - aucun accès clinique hors bris de glace revu par un humain ;
- **aucun agent IA ne pose de diagnostic, ne prescrit ni ne décide** (principe n°1).

**Flux principaux** :
1. Invitation, puis inscription (Keycloak), identité vérifiée (AIPD n°1).
2. Annuaire et réservation d'un créneau.
3. Paiement mobile money : rendez-vous retenu 15 minutes.
4. SMS de confirmation : numéro lu dans le dossier, gabarit fermé, sans nom du médecin ni motif.
5. Salle de téléconsultation réservée aux deux participants, flux chiffrés en transit (WebRTC), avec repli audio.
6. Compte-rendu écrit et signé par le professionnel.
7. Lecture du compte-rendu par le patient, et partage éventuel avec un proche ou un autre médecin.

**Hébergement** :
- OVHcloud HDS (France) prévu pour le dossier, les services, le serveur média et le TURN, **sous réserve** de l'avis juridique sur la localisation au Gabon (ADR-0004) `[À CONFIRMER]` ;
- sous-traitants à choisir : prestataire de paiement, fournisseur SMS.

## 2. Nécessité et proportionnalité

| Principe | Mesure en place | Reste à décider |
|---|---|---|
| **Base légale** | Consentements FHIR versionnés et révocables : `C-SOINS`, `C-RAPPELS` (SMS de rappel), `C-PARTAGE-PRO`, `C-PROCHE` | Consentement ou mission de soins ; régime des données de santé au Gabon `[À CONFIRMER]` ; SMS d'alerte de sécurité envoyés **sans** `C-RAPPELS` (intérêt du patient) `[À CONFIRMER]` |
| **Minimisation** | Rendez-vous sans motif ; jeton sans nom ni e-mail ; accès limité par élément (`mbolo_elements`) ; proche limité au strict utile ; SMS sans donnée de santé ; paiement sans numéro ; décisions sans texte libre | — |
| **Exactitude** | Identité vérifiée par un humain ; dossier rédigé par le professionnel ; numéro de téléphone validé par code SMS | Procédure de rectification par le patient `[À COMPLÉTER]` |
| **Durée de conservation** | Consentements et traces jamais supprimés (traçabilité) ; vidéo jamais enregistrée ; photos et pièces supprimées à échéance | Durée du dossier médical, des traces et des comptes inactifs `[À CONFIRMER]` (obligation de conservation des dossiers médicaux au Gabon ?) |
| **Information** | Textes des consentements affichés avant l'accord ; historique des accès en mots simples | Politique de confidentialité, versions vocales et langues locales `[À COMPLÉTER]` |
| **Droits** | Accès (dossier, accès, reçus), retrait de chaque consentement à tout moment, retrait des proches | Effacement face à l'obligation de conservation, portabilité, coordonnées du DPO et de la CNPDCP, délai de réponse `[À CONFIRMER]` |
| **Mineurs, majeurs protégés** | Non ouverts en vague 1 | Règles d'accès des parents et tuteurs `[À CONFIRMER]` |
| **Transferts hors du Gabon** | Professionnels et proches à l'étranger : accès en lecture seule, tracé | Encadrement juridique `[À CONFIRMER]` ; localisation de l'hébergement (ADR-0004) |
| **Sous-traitants** | Interfaces `Fournisseur` et `Canal` : aucun prestataire réel branché | Contrats (hébergeur HDS, paiement, SMS), clauses de sous-traitance, localisation des données `[À COMPLÉTER]` |

## 3. Risques pour les personnes

Gravité et vraisemblance de 1 (négligeable) à 4 (maximale), vraisemblance **après** les mesures de la section 4. Les risques des photos d'identité sont dans l'AIPD n°1.

### 3.1 Confidentialité, intégrité, disponibilité

| Risque | Conséquences pour la personne | Gravité | Vraisemblance | Principales sources |
|---|---|---|---|---|
| **Accès illégitime au dossier** | Divulgation d'une maladie à l'entourage ou à l'employeur, stigmatisation | 4 | 2 | Compte patient ou professionnel volé ; professionnel curieux ; bris de glace abusif ; faille applicative |
| **Faux professionnel** | Conseils dangereux, divulgation | 4 | 1 | Diplôme falsifié, compte prêté |
| **Prise de contrôle du compte patient** | Lecture du dossier, partage au profit d'un tiers, paiement détourné | 3 | 2 | Vol du téléphone ; carte SIM changée ; ingénierie sociale auprès de l'équipe |
| **Proche abusif** | Surveillance d'un patient sous emprise, divulgation | 3 | 2 | Pression pour obtenir l'invitation ; téléphone partagé |
| **Interception de la consultation** | Divulgation de l'image et de la voix | 4 | 1 | Réseau non sûr, salle ouverte à un tiers |
| **SMS lu par un tiers** | Révélation d'un suivi médical | 2 | 3 | Téléphone partagé en famille (fréquent) |
| **Modification du dossier** | Mauvaise prise en charge | 4 | 1 | Écriture non autorisée, erreur de rattachement |
| **Indisponibilité** | Consultation manquée, retard de soins | 3 | 2 | Panne, réseau mobile faible, attaque |
| **Inférence par le paiement** | Révélation d'une consultation par le relevé mobile money | 2 | 2 | Libellé du paiement, payeur différent du patient |
| **Exclusion** | Personne sans smartphone, sans réseau ou sans lecture privée de soins | 3 | 3 | Parcours uniquement numérique en vague 1 |

### 3.2 Erreurs de parcours ayant un effet sur la santé

| Risque | Conséquences | Gravité | Vraisemblance | Sources |
|---|---|---|---|---|
| **Urgence vitale traitée en téléconsultation** | Retard de prise en charge | 4 | 2 | Patient qui réserve au lieu d'appeler les secours |
| **Consultation interrompue** | Information incomplète, conduite à tenir mal comprise | 3 | 2 | Réseau 3G instable |

### 3.3 Si l'Agent 1 (accueil, orientation) est retenu

| Risque | Conséquences | Gravité | Vraisemblance | Sources |
|---|---|---|---|---|
| **Urgence non détectée ou mal orientée** | Retard vital | 4 | `[À ÉVALUER]` | Signaux d'alarme manqués, triage non validé |
| **Patient qui prend l'agent pour un médecin** | Fausse réassurance | 3 | `[À ÉVALUER]` | Transparence insuffisante |
| **Injection de prompt, fuite de données** | Divulgation, comportement détourné | 3 | `[À ÉVALUER]` | Message patient malveillant, document piégé |
| **Biais** (langue, sexe, âge, littératie) | Orientation inégale | 3 | `[À ÉVALUER]` | Données d'entraînement, formulation |

Cette section ne peut être évaluée qu'après la signature, par le comité médical, du triage et des signaux d'alarme (critère 4), et après l'exécution des cas de test (critères 5 et 6).

## 4. Mesures

**Techniques (en place, vérifiées par des tests automatisés)** :
- **accès** : refus par défaut ; consentement FHIR qui désigne son bénéficiaire, révocation immédiate (recherche sans cache) ; fiche du professionnel relue sans cache avant chaque accès (suspension immédiate) ; minimisation par élément dans la passerelle ; HAPI jamais exposé ;
- **traçabilité** : chaque accès tracé (`AuditEvent`) avant affichage, traces immuables, historique visible par le patient ; bris de glace avec motif et revue humaine (pas d'auto-revue) ;
- **comptes** :
  - double authentification des rôles professionnels et de l'équipe ;
  - code SMS (ou application) pour les actions sensibles des patients ;
  - récupération sans e-mail par l'équipe après rappel au numéro du dossier ;
  - changement et perte du numéro encadrés, SMS d'alerte à l'ancien numéro ;
  - aucun jeton de rafraîchissement pour le client patient ;
- **professionnels** : vérification à la source par un humain distinct du recruteur, revérification annuelle, suspension immédiate (ADR-0026) ;
- **consultation** : salle réservée aux deux participants ; aucun enregistrement ; repli audio et mode économie de données ;
- **SMS** : gabarits fermés approuvés, sans nom du médecin, numéro de dossier ni motif (contrôlé par les tests) ; numéro lu dans le dossier au moment de l'envoi ;
- **paiement** : libellé sans donnée de santé ; numéro du payeur jamais stocké ; montant fixé par le serveur ;
- **urgence** : bandeau « En cas d'urgence, appelez les secours » sur tous les écrans, même sans réseau ni connexion ;
- **socle** :
  - limites d'appels par session ;
  - en-têtes de sécurité et CSP ;
  - HTTPS exigé entre services en production ;
  - comptes de service par clé privée (`private_key_jwt`) ;
  - chiffrement par enveloppe des documents ;
  - aucun secret dans le dépôt (gitleaks) ;
  - analyse du code (Semgrep) et des dépendances en CI ;
  - revues OWASP ASVS n°1 à 3, toutes leurs corrections faites ;
- **activation** : chaque fonction derrière un feature flag désactivé par défaut ; refus si Unleash est injoignable.

**Organisationnelles** `[À COMPLÉTER]` :
- désignation et formation des titulaires de chaque rôle ; revue hebdomadaire des bris de glace, des codes de récupération et des retraits de proches ;
- contrats avec les sous-traitants (hébergeur HDS, paiement, SMS) ;
- politique de confidentialité ; procédure d'exercice des droits ;
- plan d'incident exercé sur table ([plan-incident.md](plan-incident.md)) ; test d'intrusion externe ;
- supervision déployée, astreintes nommées.

**Humaines** :
- toute décision médicale appartient au professionnel ; toute décision sensible (identité, remboursement, retrait d'un proche, suspension) à une personne habilitée ;
- consultation en personne ou orientation vers les secours en cas de doute.

## 5. Risques résiduels et plan d'action

| Risque | Résiduel | Ce qui le réduirait | Qui |
|---|---|---|---|
| Accès illégitime au dossier | Moyen | Test d'intrusion ; revue des bris de glace effective ; supervision déployée | Porteur de projet, responsable sécurité |
| Prise de contrôle du compte patient | Moyen | Application d'authentification encouragée ; formation de l'équipe à l'ingénierie sociale | Équipe `assistance-patient` |
| SMS lu par un tiers | Moyen | Gabarits relus avec le juriste ; WhatsApp ou notification dans l'application plus tard | Porteur de projet |
| Exclusion | Élevé en vague 1 | Points de consultation assistée (vague suivante) ; aidant présent | Porteur de projet |
| Urgence vitale | Moyen | Numéros des secours validés par le comité médical (question n°7) ; protocole d'orientation humaine | Comité médical |
| Agent 1 | Non évalué | Décision « avec ou sans Agent 1 » ; triage signé ; cas de test au vert | Porteur de projet, comité médical |

## 6. Avis et décision

| Rôle | Avis | Date |
|---|---|---|
| DPO | `[À COMPLÉTER]` | |
| Juriste | `[À COMPLÉTER]` | |
| Comité médical (sections 3.2 et 3.3) | `[À COMPLÉTER]` | |
| Porteur de projet | `[À COMPLÉTER]` — décision : risques résiduels acceptés ou non pour la vague 1 | |

Si un risque résiduel reste élevé après mesures, la consultation préalable de l'autorité de protection des données est à étudier avec le juriste `[À CONFIRMER]` (CNPDCP ; RGPD article 36 pour les utilisateurs européens).

Sources : ADR-0004, 0009 à 0017, 0019, 0021 à 0024, 0026 ; [registre des traitements](registre-traitements.md) ; [modèle de menaces](modele-menaces.md) ; [matrice ASVS](asvs-matrice.md) ; [AIPD n°1](aipd-verification-identite.md) ; `docs/deploiement/vagues.md` ; guide AIPD de la CNIL ; loi gabonaise n°001/2011 ; RGPD, articles 5, 6, 9, 25, 28, 32, 35 et 36.
