# ADR-0024 — Application d'authentification en option pour les patients

- **Date :** 2026-09-30
- **Statut :** acceptée (porteur de projet, 2026-09-30 : décision D4 de la revue ASVS n°2, réponses aux 4 questions ci-dessous), entièrement mise en œuvre (PR n°109, n°110 et PR CT)
- **Décideurs :** porteur de projet ; responsable sécurité (à désigner)

## Contexte

Depuis l'ADR-0022, un patient confirme par un **code SMS** les trois actions sensibles : payer une consultation, partager son dossier avec un médecin, inviter un proche. Le SMS reste exposé au **vol ou à l'échange de carte SIM**. Ce risque ne peut pas être traité par la plateforme : il dépend des opérateurs (revue ASVS n°2, `docs/securite/asvs-matrice.md`, V6.6.1).

Les professionnels et les proches utilisent déjà une application d'authentification (code TOTP à 6 chiffres qui change toutes les 30 secondes). Elle est gratuite, marche sans réseau et ne dépend pas de la carte SIM. En revanche, elle ajoute une étape pour des patients peu habitués au numérique : c'est pour cela que l'ADR-0022 ne l'avait pas retenue par défaut.

## Décision

**Le SMS reste le choix par défaut. Le patient qui le veut peut le remplacer par une application d'authentification.**

### Activer

- Le bouton « Protéger mon compte avec une application » est proposé dans l'application patient, **jamais à l'inscription**, pour que la première connexion reste simple.
- L'activation exige d'abord le **niveau 2 par SMS**. Quelqu'un qui ne connaît que le mot de passe ne peut donc pas installer sa propre application sur le compte.
- Keycloak affiche ensuite le QR code, et le patient saisit un premier code pour prouver que l'application fonctionne.
- Un **SMS d'alerte** part au numéro du dossier (nouveau gabarit fermé `application-activee`).
- L'aide cite trois applications gratuites : **Google Authenticator**, **Microsoft Authenticator** et **FreeOTP** (logiciel libre). N'importe quelle application compatible TOTP fonctionne.

### Utiliser

- Une fois l'application activée, le niveau 2 (les 3 actions sensibles, valable 15 minutes) se prouve **par le code de l'application**.
- **Le code SMS n'est plus accepté pour ce compte.** Sinon, le vol de la carte SIM ouvrirait encore le compte, et l'option ne protégerait de rien.
- Les autres SMS ne changent pas : rappels, alertes, et code à l'ancien numéro lors d'un changement de numéro (ADR-0023).

### Désactiver

- Il faut un code de l'application, sur une action lancée par l'application patient.
- Un SMS d'alerte part au numéro du dossier (gabarit `application-retiree`). Le patient revient au SMS.

### Application ou téléphone perdus

- Le patient appelle l'équipe `assistance-patient`, qui applique la procédure de l'ADR-0021 : rappel au numéro du dossier, date de naissance et numéro d'assurance, puis code de récupération dicté.
- Quand ce code est utilisé dans Keycloak, **l'application est retirée du compte** en même temps que le mot de passe est changé.
- Le patient **attend ensuite 24 heures** avant de pouvoir utiliser de nouveau le code SMS, comme après la perte d'un numéro (ADR-0023). Pendant ce délai, le vrai patient reçoit le SMS d'alerte et peut réagir.
- Si le numéro a aussi changé, le patient suit en plus le parcours « perte » de l'ADR-0023.
- **Aucun code de secours imprimé** : ils sont souvent perdus, difficiles à expliquer, et ils seraient un secret de plus à garder.

### Ce qui ne change pas

- Aucun feature flag : c'est une protection, et la sécurité n'est jamais derrière un flag.
- Aucune action sensible ne bloque l'orientation vers les secours (principe n°2).
- Retirer un partage ou un proche reste possible au niveau 1.

## Conséquences

- **Positives :**
  - le patient qui le souhaite est protégé du vol de carte SIM ;
  - les codes ne coûtent plus de SMS pour lui ;
  - le mécanisme reste dans Keycloak, comme pour les professionnels.
- **Négatives :**
  - un chemin de plus dans le flux Keycloak `navigateur-mbolo` et deux actions à maintenir ;
  - l'équipe `assistance-patient` aura des appels en plus quand un patient change de téléphone sans transférer son application.
- **Risques :**
  - un patient qui retire l'application par erreur revient au SMS : le SMS d'alerte le prévient ;
  - un patient qui perd son application attend 24 heures avant de pouvoir payer. Ce délai est accepté pour la sécurité, et il n'empêche ni l'urgence ni l'annulation.

## Mise en œuvre (petites PR)

1. **Keycloak** :
   - au niveau 2, le code de l'application quand le patient en a une, et le code SMS sinon ;
   - l'authentificateur `mbolo-code-sms` refuse un compte qui a une application ;
   - action d'activation (niveau 2 exigé) et action de retrait (code de l'application exigé), lancées par l'application patient avec `kc_action` ;
   - SMS `application-activee` et `application-retiree` dans `notifications`.
   - E2E.
   - **Faite (PR CR)** : le justificatif retenu est désigné par l'attribut `mbolo_application` (non modifiable par le patient) ; un code TOTP ajouté par l'action standard de Keycloak ne remplace pas le SMS (scénario e2e) ; justificatif disparu → niveau 2 refusé sans retour au SMS.
2. **Récupération** :
   - le code de l'équipe (flux `identifiants-oublies-mbolo`) retire aussi l'application ;
   - 24 heures sans code SMS ensuite, avec un message Keycloak clair.
   - E2E.
   - **Faite (PR CS)** : attribut `mbolo_application_retiree_le` (date du retrait), posé seulement si le compte avait une application ; un patient sans application récupère son compte comme avant ; l'alerte est le SMS `compte-recupere` de l'ADR-0021.
3. **Application patient** :
   - écran « Protéger mon compte » (explication simple, les trois applications citées, activer ou retirer), message au retour selon `kc_action_status` ;
   - ligne « faite » dans la matrice ASVS (V6.6.1).
   - E2E.
   - **Faite (PR CT)** : écran « Protéger mon compte » (depuis « Mes rendez-vous ») ; un niveau 2 obtenu par SMS depuis moins de 15 minutes suffit, Keycloak ne redemande pas de code (scénario e2e). **ADR entièrement codée.**

## Réponses du porteur de projet (2026-09-30)

1. Une fois l'application activée, **le SMS n'est plus accepté** pour les actions sensibles : oui.
2. Après la perte de l'application, **24 heures d'attente** avant de revenir au SMS : oui.
3. **Pas de codes de secours imprimés**, perte traitée par l'équipe `assistance-patient` : oui.
4. **Citer 2 ou 3 applications gratuites** dans l'aide : Google Authenticator, Microsoft Authenticator, FreeOTP.

## Sources

- ADR-0021 (récupération du compte), ADR-0022 (double authentification des patients), ADR-0023 (changement de numéro).
- Revue ASVS n°2 (`docs/securite/asvs-matrice.md`) : V6.6.1, décision D4.
- RFC 6238 (TOTP) ; OWASP ASVS 5.0, chapitre 6 (authentification).
