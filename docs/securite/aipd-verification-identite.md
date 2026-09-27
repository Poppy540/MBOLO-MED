# AIPD n°1 — Vérification d'identité par photos — BROUILLON v0.1

> **Brouillon à valider par le porteur de projet, le juriste et le DPO avant toute utilisation avec de vraies personnes.** Méthode inspirée du guide AIPD de la CNIL. Les passages `[À CONFIRMER]` attendent l'avis juridique (hypothèses de `memory.md`). Traitement T9 du [registre](registre-traitements.md).
>
> Pourquoi une AIPD : données d'identité **et image du visage**, personnes potentiellement vulnérables (faible littératie, mineurs possibles), traitement à grande échelle à terme. Risque considéré comme **élevé**.

## 1. Description du traitement

- **Finalité** : s'assurer qu'un patient est bien la personne inscrite avant sa première consultation (ADR-0014). Sans identité vérifiée, aucune réservation n'est possible.
- **Données** :
  - identité déclarée à l'inscription : nom, prénom, date de naissance, sexe (facultatif), téléphone ;
  - photo du document : pièce d'identité avec le numéro d'assurance maladie (Gabon : CNAMGS), ou acte de naissance ;
  - photo du visage ;
  - numéro d'assurance maladie ou numéro provisoire, saisi par le vérificateur ;
  - décision : identifiant technique du vérificateur, date, résultat (« vérifiée », « refusée », « à refaire »), motif codé d'une liste fermée ;
  - traces : chaque consultation de l'identité ou d'une photo (`AuditEvent` dans le dossier).
- **Personnes concernées** : patients invités (vague 1 : cohorte limitée), aidants présents à l'inscription.
- **Acteurs** :
  - le **patient**, qui accepte la charte et envoie ses photos depuis son téléphone ;
  - le **vérificateur**, humain habilité (rôle `verification-identite`, double authentification), qui compare à l'œil ;
  - aucun médecin, administrateur technique ni agent IA n'accède aux photos.
- **Flux** :
  1. l'application patient affiche la charte ; l'accord (ou le refus) est enregistré dans le dossier (`Consent` `C-IDENTITE`, avec la version du texte) ;
  2. chaque photo est réduite et recompressée **sur le téléphone** (métadonnées de lieu et d'appareil retirées), puis envoyée au service `documents` ;
  3. le service chiffre la photo avec **sa propre clé**, elle-même chiffrée par une clé maître gardée hors du stockage ; la photo chiffrée va dans le stockage objet, la clé chiffrée et les métadonnées (sans image ni nom) dans la base des services ;
  4. le vérificateur ouvre la fiche : chaque consultation est tracée dans le dossier **avant** l'affichage ; les photos restent en mémoire le temps de l'écran ;
  5. la décision met à jour le statut et le numéro dans le dossier (la passerelle ne permet de modifier rien d'autre) ;
  6. à échéance, la clé de la photo est détruite (la photo devient illisible), puis la photo est supprimée.
- **Hébergement** : OVHcloud HDS (France) prévu, **sous réserve** de l'avis juridique sur la localisation au Gabon (ADR-0004) `[À CONFIRMER]`.

## 2. Nécessité et proportionnalité

| Principe | Mesure | Reste à décider |
|---|---|---|
| **Base légale** | Consentement explicite par la charte, versionnée et révocable | Consentement ou obligation légale d'identifier le patient `[À CONFIRMER]` ; si obligation, le refus n'offre pas d'alternative à distance (vérification en personne) |
| **Minimisation** | Deux photos seulement ; au plus deux par type ; aucune donnée de santé ; le médecin voit seulement « identité vérifiée » ; métadonnées sans image ni nom ; décisions sans texte libre | — |
| **Exactitude** | « À refaire » si la photo est inexploitable ; « refusée » avec motif ; vérification en personne en dernier recours | Procédure de contestation d'un refus `[À COMPLÉTER]` |
| **Durée de conservation** | Paramétrable par pays (90 jours par défaut) ; suppression automatique (clé détruite puis photo supprimée) ; le résultat reste dans le dossier | Durée des photos et de la trace de vérification `[À CONFIRMER]` |
| **Information** | Charte rédigée pour être lue à voix haute, affichée avant tout envoi | Traduction et lecture vocale en langues locales |
| **Droits** | Accès, rectification, suppression, retrait de l'accord ; le patient voit qui a consulté ses photos | Coordonnées du DPO et de la CNPDCP `[À COMPLÉTER]` ; délai de réponse |
| **Mineurs et majeurs protégés** | Non traités en vague 1 | Qui accepte la charte, avec quel document `[À CONFIRMER]` |
| **Sous-traitants** | Hébergeur (stockage objet, base) | Contrat HDS, clauses de sous-traitance `[À CONFIRMER]` |

## 3. Risques pour les personnes

Gravité et vraisemblance : 1 (négligeable) à 4 (maximale). Vraisemblance **après** les mesures de la section 4.

| Risque | Conséquences pour la personne | Gravité | Vraisemblance | Principales sources |
|---|---|---|---|---|
| **Accès illégitime aux photos** | Usurpation d'identité, exposition du visage, atteinte à la vie privée | 4 | 2 | Vol du stockage ou de la base ; abus d'un vérificateur ; compte vérificateur compromis |
| **Modification non désirée** | Identité vérifiée à tort (quelqu'un consulte à la place du patient) ou refusée à tort (perte d'accès aux soins) | 3 | 2 | Photo truquée ; erreur ou fraude du vérificateur |
| **Disparition** | Nouvel envoi de photos nécessaire, retard de consultation | 2 | 2 | Perte de la clé maître ; suppression prématurée |
| **Détournement de finalité** | Réutilisation des photos (publicité, reconnaissance faciale, transmission) | 4 | 1 | Évolution non contrôlée du produit ; demande d'un tiers |
| **Exclusion** | Personne sans pièce d'identité ni téléphone adapté privée de soins | 3 | 2 | Parcours uniquement numérique |

## 4. Mesures

**Techniques (en place, vérifiées par des tests automatisés)** :
- chiffrement par photo (AES-256-GCM), clé enveloppée par une clé maître hors stockage ; identifiant du document lié au chiffré ;
- formats vérifiés sur le contenu (JPEG, PNG), 2 Mo au plus ; recompression sur le téléphone ;
- dépôt refusé sans accord à la version en vigueur de la charte, et après vérification ;
- accès aux photos réservé au rôle `verification-identite` ; personne ne vérifie sa propre identité ; jamais un agent IA ;
- chaque consultation tracée dans le dossier **avant** affichage, visible par le patient ; traces immuables ;
- modification du dossier limitée au statut et au numéro (passerelle) ;
- aucune reconnaissance faciale automatique ;
- limites d'appels sur tous les services ; suppression automatique à échéance ;
- flag `identite.photos` désactivé tant que la charte n'est pas validée.

**Organisationnelles** :
- charte validée par le juriste avant activation ;
- vérificateurs désignés par le porteur de projet, formés, en nombre restreint `[À COMPLÉTER]` ;
- revue régulière des consultations de photos (comme les bris de glace) `[À COMPLÉTER : fréquence, relecteur]` ;
- plan d'incident « fuite de photos d'identité » ([plan-incident.md](plan-incident.md)).

**Humaines** :
- la décision appartient toujours à une personne habilitée ;
- vérification en personne par un professionnel de santé en dernier recours (refus de la charte, photo inexploitable, doute).

**Reste à faire avant activation** : clé maître dans le KMS de l'hébergeur (aujourd'hui clé locale du coffre-fort) ; journal des consultations exporté vers la supervision ; test d'intrusion ; exercice sur table du plan d'incident.

## 5. Avis et décision

| Rôle | Avis | Date |
|---|---|---|
| DPO | `[À COMPLÉTER]` | |
| Juriste | `[À COMPLÉTER]` | |
| Porteur de projet | `[À COMPLÉTER]` — décision d'activer ou non le flag `identite.photos` | |

Sources : ADR-0004, ADR-0013, ADR-0014, ADR-0015 ; [charte de vérification d'identité](charte-verification-identite.md) ; [modèle de menaces](modele-menaces.md) ; guide AIPD de la CNIL ; loi gabonaise n°001/2011 ; RGPD, articles 5, 9, 25, 32 et 35.
