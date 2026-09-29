# ADR-0014 — Inscription d'un patient avec un code d'invitation

- **Date :** 2026-09-27
- **Statut :** acceptée (porteur de projet, 2026-09-27) ; durée de conservation des photos et texte de la charte à valider avec l'avis juridique
- **Décideurs :** porteur de projet

## Contexte
La vague 1 est ouverte sur invitation (ADR-0013) : un humain habilité remet un code à usage unique à une personne qu'il connaît. Il manque la dernière étape, où la personne crée son compte à partir de ce code.

Aujourd'hui, la création de compte est fermée dans Keycloak (`registrationAllowed: false`). Deux attributs sont réservés à l'administrateur : `patient_id` (lien vers le dossier FHIR) et le rôle `patient`.

Une inscription doit faire, de façon cohérente :
1. vérifier et **utiliser** le code, une seule fois ;
2. créer le **patient dans le dossier FHIR**, avec les données d'identité nécessaires aux soins ;
3. créer le **compte Keycloak**, avec le rôle `patient` et l'attribut `patient_id`.

Contraintes :
- **Minimisation** (principe n°3) : le jeton ne contient ni nom ni e-mail (ADR-0009). L'identité reste dans le dossier.
- **Moindre privilège** : le pouvoir de créer des comptes ne doit jamais permettre de créer un professionnel ou un administrateur.
- **Mot de passe** : le moins de composants possible doivent le voir passer.
- **Export** : champs d'identité, formats de téléphone et règles de mot de passe paramétrables par pays.

## Options envisagées
1. **Service d'inscription + API d'administration Keycloak.** Le service `invitations` reçoit le formulaire, utilise le code, crée le `Patient` (passerelle, permission `system/Patient.c`), puis crée le compte Keycloak avec un compte de service limité à la gestion des utilisateurs.
   - Réalisable en TypeScript, avec les outils actuels.
   - Le mot de passe **transite** par le service (TLS, jamais journalisé ni stocké ; Keycloak le hache).
   - Le compte de service a un pouvoir fort : il faudra verrouiller par test qu'il ne peut attribuer que le rôle `patient`.
2. **Extension Keycloak (SPI Java) dans le formulaire d'inscription natif.** Keycloak demande le code et appelle le service `invitations` pour l'utiliser.
   - Le mot de passe **ne quitte jamais Keycloak**, et aucun service n'a le droit de créer des comptes.
   - Il faut développer, tester et livrer une extension Java, dans une équipe TypeScript, et la maintenir à chaque version de Keycloak.
   - Création du `Patient` FHIR à faire dans l'extension ou juste après.
3. **Création par un humain** (le gestionnaire crée le compte avec la personne) : simple, mais ne passe pas à l'échelle et fait connaître le mot de passe initial à un tiers.

## Décision (porteur de projet, 2026-09-27)

### 1. Extension Keycloak (option 2)
- L'inscription se fait dans le **formulaire natif de Keycloak**, complété par une extension (SPI Java) qui demande le code d'invitation.
- Le **mot de passe ne quitte jamais Keycloak**, et aucun service de la plateforme n'a le droit de créer des comptes.
- L'extension appelle le service `invitations`, avec un jeton de service, pour **utiliser** le code de façon atomique. Si le compte ne peut pas être créé, le code est rendu.
- Le rôle `patient` est attribué par l'extension, et uniquement celui-là (liste fermée, vérifiée par test).

### 2. Remise du code par téléphone
L'équipe communique le code par téléphone :
- soit **au patient** lui-même ;
- soit **au proche ou à l'aidant** qui l'aidera à créer son dossier. Le patient doit être présent et consentir ; le compte reste au nom du patient.

### 3. Vérification d'identité dès la vague 1 (option B)
Deux cas :
- **Le patient a un numéro CNAMGS** : il le donne à l'inscription, avec sa pièce d'identité, qui est vérifiée.
- **Il n'en a pas** : un **professionnel de santé** crée son dossier à partir de son **acte de naissance**, lui attribue un **numéro provisoire Mbolo** et prend une photo.

Conséquences :
- **Sans identité vérifiée, pas de consultation.** Le compte existe, mais le dossier est marqué « identité à vérifier » et la réservation reste fermée. Une urgence est toujours orientée vers les secours (principe n°2).
- La vérification est faite **par un humain habilité**, jamais par une IA (principe n°1). Elle est **tracée** : qui, quand, quel type de document.
- Les photos de documents sont des données très sensibles. Elles vont dans le **stockage chiffré** (`STORAGE_*`, ADR-0004), jamais dans la base des services, dans le jeton ni dans les journaux. Le dossier FHIR ne garde qu'une référence et le résultat de la vérification.
- Le numéro CNAMGS et le numéro provisoire sont des **identifiants** du dossier (`Patient.identifier`), avec des systèmes d'identifiants **paramétrables par pays** (CNAMGS est propre au Gabon).
- Le numéro CNAMGS est déclaratif tant qu'aucune interface avec la CNAMGS n'existe (convention visée en vague 4).

### 4. Données demandées
| Donnée | Où | Pourquoi |
|---|---|---|
| Nom et prénom | Dossier FHIR (`Patient.name`) | Le professionnel doit savoir qui il soigne |
| Date de naissance | Dossier FHIR (`Patient.birthDate`) | Âge : indispensable à une consultation |
| Sexe (facultatif, « ne souhaite pas répondre » possible) | Dossier FHIR (`Patient.gender`) | Utile au professionnel |
| Téléphone mobile | Dossier FHIR (`Patient.telecom`) | Rappels et notifications (avec consentement `C-RAPPELS`) |
| Numéro CNAMGS ou numéro provisoire Mbolo | Dossier FHIR (`Patient.identifier`) | Identification du patient |
| Photo de la pièce d'identité ou de l'acte de naissance | Stockage chiffré, référencée par le dossier | Preuve de la vérification d'identité |
| Identifiant de connexion et mot de passe | Keycloak seulement | Connexion |

- Pas d'e-mail obligatoire.
- L'identifiant de connexion est choisi par le patient ; ce n'est ni son nom ni son numéro.

### Modalités de la vérification (porteur de projet, 2026-09-27)
1. **Deux photos** : le document (pièce d'identité ou acte de naissance) **et** le visage du patient.
2. **Patients avec CNAMGS** : vérification **à distance**. Les photos sont envoyées à l'inscription et contrôlées par une personne de Mbolo avant la première consultation.
3. **Rôle dédié `verification-identite`** avec double authentification :
   - aucun accès clinique ;
   - jamais attribué à un agent IA ;
   - chaque décision (acceptée, refusée, à refaire) est tracée : qui, quand, motif en cas de refus.
4. **Conservation des photos comme preuve**, sous réserve de l'avis juridique (durée à fixer). Une **charte** précisant ces termes doit être **acceptée avant l'envoi des photos** :
   - photos prises ;
   - finalité ;
   - qui y accède ;
   - durée de conservation ;
   - droits du patient.

   Brouillon : [`docs/securite/charte-verification-identite.md`](../../securite/charte-verification-identite.md) (v0.1), à valider par le porteur de projet et le juriste. Son acceptation est enregistrée (version, date).

## Conséquences
- **Extension Keycloak en Java** :
  - construite et testée en CI, livrée dans une image Keycloak dédiée ;
  - à maintenir à chaque version de Keycloak ;
  - premier composant Java de la plateforme.
- **Parcours en deux temps** :
  1. **L'inscription** (code, compte, dossier « identité à vérifier ») peut être construite dès maintenant.
  2. **La vérification d'identité** (photos du document et du visage, charte acceptée, stockage chiffré, contrôle par le rôle `verification-identite`, levée du blocage) suit.
- **Nouveaux éléments** :
  - profil FHIR `mbolo-patient` : identifiants, statut de vérification, marqué fictif hors production ;
  - compte de service de l'extension vers `invitations` ;
  - service de stockage chiffré des documents.
- **À mettre à jour** :
  - registre des traitements : vérification d'identité, photos de documents ;
  - AIPD : données d'identité et documents, risque élevé ;
  - modèle de menaces : extension Keycloak, stockage des documents.
- **Risques** :
  - fuite des photos de documents : chiffrement, accès restreint et journalisé, conservation minimale ;
  - blocage de patients sans document : le parcours accompagné par un professionnel, avec l'acte de naissance, y répond.

## Mise en œuvre de la saisie d'identité (PR AD)
- **Action requise Keycloak `mbolo-identite-patient`** : elle s'affiche juste après l'inscription, pour tout compte `patient` sans `patient_id`. Depuis la revue ASVS n°2 (C8), le numéro saisi est validé par un code SMS avant la création du dossier.
- **Champs demandés** : nom, prénom, date de naissance, sexe (facultatif), téléphone, numéro d'assurance maladie (facultatif).
- **Création du dossier** : l'extension crée le `Patient` au statut `a-verifier` par la passerelle, avec un jeton de 60 s limité à `system/Patient.c`, puis pose `patient_id`. Aucun service de la plateforme ne modifie de compte, et l'identité ne reste pas dans Keycloak.
- **Blocage des consultations** : la réservation est refusée tant que le statut n'est pas `verifiee`, et l'application affiche « identité à vérifier ». Le service de téléconsultation ne lit, du patient, que ce statut (`Patient.extension`).
- **Paramètres par pays** : système du numéro d'assurance (Gabon : CNAMGS), environnement (marqueur `fictif` hors production), adresse de la passerelle. Ce sont des variables `KC_SPI_REQUIRED_ACTION_MBOLO_IDENTITE_PATIENT_*`, et non des secrets.

Sources : ADR-0009, ADR-0010, ADR-0013 ; documentation Keycloak, API d'administration et rôles `realm-management` — https://www.keycloak.org/docs/latest/server_admin/#_admin_permissions ; principes n°3, n°5 et n°7 de `CLAUDE.md`.
