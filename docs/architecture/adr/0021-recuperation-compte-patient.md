# ADR-0021 — Récupération du compte d'un patient sans e-mail

- **Date :** 2026-09-29
- **Statut :** acceptée (porteur de projet, 2026-09-29) ; texte du SMS d'alerte et fréquence de revue à confirmer
- **Décideurs :** porteur de projet ; responsable sécurité (à désigner)

## Contexte

La revue OWASP ASVS n°1 (`docs/securite/asvs-matrice.md`) a laissé une décision ouverte, **D2** : un patient qui a oublié son mot de passe n'a aujourd'hui **aucun moyen de retrouver son compte**.

- Keycloak propose « mot de passe oublié » (`resetPasswordAllowed`), mais le lien part **par e-mail**, et la plupart des patients n'en ont pas : le formulaire d'inscription ne le demande pas (ADR-0014).
- Créer un nouveau compte n'est pas une solution : il faudrait un nouveau code d'invitation, le lien avec le dossier (`patient_id`) serait perdu ou dupliqué, et l'identité devrait être revérifiée.

Contraintes :

- **Prise de contrôle de compte** : la récupération est la porte d'entrée préférée d'un attaquant (ingénierie sociale, vol de carte SIM). Elle doit être au moins aussi solide que la connexion.
- **Mot de passe** : il ne quitte jamais Keycloak (ADR-0014).
- **Aucun agent IA** ne décide d'une récupération ni ne remet un code (principes n°1 et n°7).
- **Faible littératie, faible débit** : un parcours court, en français simple, utilisable sur un petit téléphone.
- **Export** : numéros, systèmes d'identifiants et textes paramétrables par pays.

## Options envisagées

1. **Lien par e-mail (Keycloak natif)** : la plupart des patients n'ont pas d'e-mail. Il resterait possible plus tard, pour ceux qui en ont un et qui l'ont confirmé.
2. **Code par SMS en libre-service**, envoyé au numéro du dossier :
   - rapide et sans intervention humaine ;
   - mais un vol de carte SIM suffit pour prendre le compte ;
   - dépend du fournisseur SMS, qui n'est pas encore choisi (ADR-0012) ;
   - à décider avec **D1** (double authentification des patients).
3. **Code de récupération remis par l'équipe `assistance-patient`**, après les mêmes vérifications que le retrait des proches (ADR-0019) : rappel **au numéro du dossier**, puis contrôle de la date de naissance par le service.
   - plus lent, et demande une équipe disponible ;
   - mais un humain habilité (MFA) vérifie, et chaque étape est tracée.
4. **Nouveau compte** : écarté (lien au dossier perdu, doublons, nouvelle vérification d'identité).

## Proposition (option 3)

### Parcours

1. Le patient appelle l'assistance, ou passe dans un point de consultation assistée.
2. Le membre de l'équipe (rôle `assistance-patient`, MFA, jamais une IA) retrouve le dossier par son **numéro d'assurance ou provisoire**. Il **raccroche et rappelle le numéro du dossier**, jamais le numéro qui a appelé.
3. Il saisit la **date de naissance** dite par le patient. Le **service la compare**, sans jamais l'afficher, avec au plus 3 essais par 15 minutes (compteurs partagés, D3).
4. Le service `invitations` crée un **code de récupération** à usage unique :
   - 8 caractères, même alphabet que les codes d'invitation, seule une empreinte HMAC est gardée ;
   - rattaché au **dossier** (`patient_id`), jamais à un nom ;
   - valable **24 h** (à confirmer).
   - Le membre de l'équipe **dicte le code pendant l'appel au numéro du dossier**. Le code ne passe par aucun autre canal.
5. Dans Keycloak, sur l'écran « Mot de passe oublié ? », le patient saisit son identifiant et le code. Une **extension Keycloak**, sur le même principe que l'inscription (ADR-0014), demande au service `invitations` d'**utiliser** le code.
   - Le code n'est accepté que si le `patient_id` du compte est celui du code.
   - Keycloak demande ensuite un nouveau mot de passe. Il ne quitte jamais Keycloak.
6. À la fin :
   - **toutes les sessions** du compte sont fermées ;
   - un **SMS d'alerte** part au numéro du dossier (« Le mot de passe de votre compte Mbolo Santé a été changé. Si ce n'est pas vous, appelez l'assistance. »), même sans `C-RAPPELS`, comme l'alerte d'inscription d'un proche.

### Garde-fous

- **Flag** `compte.recuperation`, désactivé par défaut (vague 1).
- **Traces** : chaque étape est journalisée (qui, quel dossier, quand, résultat), sans la date de naissance, sans le code et sans le numéro.
- **Limites** : 3 essais de date de naissance par membre de l'équipe et par dossier ; essais de code limités par adresse du navigateur (compteurs partagés, D3).
- **Revue** : liste des récupérations relue par le responsable sécurité, avec une fréquence à fixer.
- **Hors périmètre** : les comptes des **professionnels** (réinitialisation par un administrateur, avec la MFA) et les **proches** (le patient les retire, puis les invite de nouveau, ADR-0019).

## Conséquences

- **Positives** :
  - les patients sans e-mail retrouvent leur compte sans perdre leur dossier ;
  - le mot de passe reste dans Keycloak ;
  - un humain habilité vérifie chaque récupération, et tout est tracé.
- **Négatives** :
  - il faut une équipe d'assistance joignable, et le délai dépend de sa disponibilité ;
  - l'extension Keycloak grossit : un authentificateur de plus à maintenir à chaque version.
- **Risques** :
  - **Ingénierie sociale** (une personne se fait passer pour le patient) : limitée par le rappel au numéro du dossier et la date de naissance.
  - **Vol de carte SIM** : le rappel arrive au voleur. La date de naissance reste nécessaire, et le SMS d'alerte arriverait lui aussi au voleur. Ce risque est à peser avec D1.
  - Une date de naissance est souvent connue des proches : elle ne suffit pas seule.

## Réponses du porteur de projet (2026-09-29)

1. **Option retenue** : l'option 3, l'équipe d'assistance.
2. **Validité du code** : 24 h (paramètre `INVITATIONS_RECUPERATION_VALIDITE_HEURES`, 1 à 72 h).
3. **Aidant** : oui, le code peut être dicté à un aidant, patient présent et consentant, comme pour l'inscription (ADR-0014).
4. **Vérification supplémentaire** : le patient lit aussi son **numéro d'assurance ou provisoire** ; le service le compare au dossier, sans jamais l'afficher, en plus de la date de naissance.
5. **Revue** : par défaut, **mensuelle, par le responsable sécurité** (à désigner) ; à confirmer.
6. **SMS d'alerte** : brouillon « Mbolo Santé : le mot de passe de votre compte vient d'être changé avec un code de l'équipe. Si ce n'est pas vous, contactez l'équipe. », envoyé quand le code sert ; à faire relire avec les autres gabarits.

## Mise en œuvre

- **Serveur (service `invitations`)** : code de type `recuperation` rattaché au dossier (`patient_id`, migration `0005`), un seul valable par dossier ; `POST /assistance/recuperation` (rôle `assistance-patient`, flag `compte.recuperation`) et `POST /recuperation/utilisation` (extension Keycloak seulement, essais limités par adresse). Le flag est relu à l'utilisation, pour le membre de l'équipe qui a remis le code.
- **Keycloak** : authentificateur dans le flux « identifiants oubliés », à la place de l'e-mail (PR suivante).
- **Espace professionnel** : écran de l'équipe d'assistance (PR suivante).

## Questions au porteur de projet (posées le 2026-09-29)

1. **Option retenue** : l'option 3 (équipe), l'option 2 (SMS en libre-service, avec D1), ou l'option 3 d'abord puis l'option 2 plus tard ?
2. **Durée de validité** du code : 24 h, ou moins (1 h, pendant l'appel) ?
3. Le code peut-il être dicté à un **aidant**, patient présent et consentant, comme pour l'inscription (ADR-0014) ?
4. **Vérification supplémentaire** au-delà de la date de naissance : numéro d'assurance lu par le patient, ou passage dans un point de consultation assistée si le téléphone a changé ?
5. **Fréquence de revue** des récupérations, et qui la fait ?
6. **Texte du SMS d'alerte** (à faire relire, comme les autres gabarits).
