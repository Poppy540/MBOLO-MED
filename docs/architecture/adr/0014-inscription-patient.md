# ADR-0014 — Inscription d'un patient avec un code d'invitation

- **Date :** 2026-09-27
- **Statut :** proposée (à valider par le porteur de projet)
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

## Décision proposée
**Option 1 pour la vague 1**, avec ces garde-fous. L'option 2 est à réévaluer avant la vague 2 (volume plus grand).

### Garde-fous
- **Compte de service `mbolo-inscription-service`** :
  - seulement `manage-users` et `view-users` du royaume, aucun autre droit d'administration ;
  - le code n'attribue **que** le rôle `patient` (liste fermée) ;
  - un test e2e vérifie qu'une tentative d'attribuer un autre rôle est refusée par le service ;
  - le royaume est vérifié par un test (aucun rôle composite ajouté au compte de service).
- **Passerelle** : `system/Patient.c` uniquement pour ce compte, sans lecture ni modification des patients existants.
- **Ordre et compensation** :
  - le code est utilisé d'abord, de façon atomique ;
  - si le dossier ou le compte ne peuvent pas être créés, le code est rendu utilisable ;
  - un patient créé sans compte est marqué inactif (`Patient.active = false`), jamais supprimé.
- **Mot de passe** :
  - jamais journalisé, jamais stocké par le service, transmis directement à Keycloak ;
  - politique de mot de passe définie dans Keycloak, paramétrable par déploiement.
- **Essais limités** : même limite que la vérification des codes, par adresse.
- **Aucune vérification d'identité en vague 1**, au-delà de l'invitation remise en main propre. À revoir avec l'avis juridique (identification des patients : pièce d'identité, numéro CNAMGS ?).

### Données demandées à l'inscription (proposition)
| Donnée | Où | Pourquoi |
|---|---|---|
| Nom et prénom | Dossier FHIR (`Patient.name`) | Le professionnel doit savoir qui il soigne |
| Date de naissance | Dossier FHIR (`Patient.birthDate`) | Âge : indispensable à une consultation |
| Sexe (facultatif, « ne souhaite pas répondre » possible) | Dossier FHIR (`Patient.gender`) | Utile au professionnel |
| Téléphone mobile | Dossier FHIR (`Patient.telecom`) | Rappels et notifications (avec consentement `C-RAPPELS`) |
| Identifiant de connexion et mot de passe | Keycloak seulement | Connexion |

- Pas d'e-mail obligatoire : beaucoup de patients n'en ont pas.
- L'identifiant de connexion est choisi par le patient. Ce n'est ni son nom ni son numéro, pour qu'il ne soit pas identifiant hors du dossier.

## Conséquences
- Nouveaux éléments :
  - compte de service Keycloak et secret `INSCRIPTION_SERVICE_CLIENT_SECRET` ;
  - permission `system/Patient.c` sur la passerelle ;
  - route publique `POST /inscriptions` ;
  - écran « J'ai un code d'invitation » dans l'application patient.
- Profil FHIR `mbolo-patient` à définir : champs obligatoires et invariant « marqué fictif hors production ».
- À mettre à jour : registre des traitements (T8 étendu à l'inscription), AIPD, modèle de menaces (compte de service qui crée des comptes).
- Risque principal : abus du compte de service. Il est couvert par la liste fermée de rôles, les tests de refus et le journal d'administration de Keycloak (`adminEventsEnabled`).

Sources : ADR-0009, ADR-0010, ADR-0013 ; documentation Keycloak, API d'administration et rôles `realm-management` — https://www.keycloak.org/docs/latest/server_admin/#_admin_permissions ; principes n°3, n°5 et n°7 de `CLAUDE.md`.
