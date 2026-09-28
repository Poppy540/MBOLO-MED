# ADR-0019 — Le patient invite un proche depuis son application

- **Date :** 2026-09-28
- **Statut :** acceptée (porteur de projet, 2026-09-28) ; texte `C-PROCHE` à valider par le juriste ; vague 2
- **Décideurs :** porteur de projet ; texte `C-PROCHE` à valider par le juriste

## Contexte

Le partage avec un proche existe côté serveur :

- consentement `C-PROCHE`, révocable, derrière le flag `consentement.proche` ;
- lecture réduite au strict utile (ordonnances et « conduite à tenir », flag `documents.proche`, décision du porteur de projet du 2026-09-28) ;
- lecture tracée, visible dans « Mes partages et accès ».

Mais **un proche ne peut pas encore obtenir de compte**. Il faut aujourd'hui :

1. créer à la main sa fiche `RelatedPerson` dans le dossier, rattachée au patient ;
2. créer à la main son compte Keycloak, avec le rôle `proche` et l'attribut `related_person_id`.

C'est le cœur de l'offre **Diaspora Famille** : un enfant à l'étranger suit le traitement d'un parent resté au pays. Le parcours doit donc partir **du patient**, qui décide qui est son proche (principe n°7).

Contraintes :

- **Minimisation** (principe n°3) : le moins possible de données sur le proche, qui n'est pas soigné.
- **Moindre privilège** : un patient ne doit jamais pouvoir créer autre chose qu'un proche **à lui** (ni professionnel, ni proche d'un autre patient).
- **Mot de passe** : ne quitte jamais Keycloak (ADR-0014).
- **Aucun agent IA** n'invite, ne désigne ni ne consent à la place du patient.
- **Export** : proche souvent à l'étranger (indicatif, langue) ; rien de codé en dur.

## Options envisagées

### Qui crée la fiche du proche

- **A. À l'invitation, par le service `invitations`** : quand le patient invite, le service crée une `RelatedPerson` **inactive** (`active: false`), rattachée au patient, puis un code d'invitation qui la désigne. À l'inscription, la fiche devient active.
  - Le lien proche–patient est fixé **par le serveur**, jamais par le formulaire d'inscription.
  - Une invitation abandonnée laisse une fiche inactive (sans accès), supprimable à échéance.
- **B. À l'inscription, par l'extension Keycloak** : l'extension crée la `RelatedPerson`.
  - Donne à Keycloak un droit d'écriture dans le dossier ; plus de code Java à maintenir.

### Comment le code arrive au proche

- **1. Affiché au patient**, qui le transmet lui-même (appel, SMS, WhatsApp, bouton « Partager » du téléphone). **Aucun numéro du proche n'est collecté.**
- **2. Envoyé par SMS au proche** par la plateforme : plus simple pour le patient, mais il faut collecter et garder le numéro du proche (souvent étranger : coût, fournisseur, données).

### Vérification d'identité du proche

- **I. Aucune** : le proche est celui que le patient a choisi ; le risque (code intercepté) est limité par un code court, à usage unique, une lecture réduite, tracée et révocable, et une alerte au patient à l'activation.
- **II. Photos d'identité** (comme ADR-0015) : plus sûr, mais lourd pour un proche à l'étranger, et plus de données sensibles.

## Décision (porteur de projet, 2026-09-28)

1. **Fiche créée à l'invitation (option A)**, par le service `invitations`, avec le compte de service qui reçoit `system/RelatedPerson.cu` (création, puis activation).
2. **Code envoyé par SMS au proche (option 2)** — décision du porteur de projet :
   - le **patient saisit le numéro de son proche au moment d'inviter** (confirmé par le porteur de projet) : à l'abonnement ou au paiement, ce serait trop tard, car le proche doit d'abord recevoir le code pour créer son compte ; l'abonnement Diaspora Famille se prend ensuite, une fois connecté ;
   - numéro au **format international** (indicatif choisi dans une liste, celui du pays par défaut), car le proche vit souvent à l'étranger ;
   - le numéro sert **seulement à envoyer le code**, puis n'est **pas gardé** : ni dans le dossier, ni dans la base, ni dans les journaux (comme le numéro du payeur, ADR-0017). Le proche pourra plus tard donner lui-même son numéro, avec son propre consentement, s'il veut des rappels ;
   - le SMS, par le service `notifications` (gabarit fermé), ne contient **ni le nom du patient ni aucune donnée de santé** : « Vous êtes invité sur Mbolo Santé. Code : ABCD-EFGH [FICTIF], valable 7 jours. » Le patient prévient lui-même son proche ;
   - **en secours** (SMS non reçu, fournisseur indisponible), le patient peut aussi lire le code affiché à son proche ;
   - le coût des SMS internationaux et le fournisseur (question ouverte n°5, ADR-0012) sont à intégrer aux devis.
3. **Pas de vérification d'identité du proche (option I)** en vague 2 — décision du porteur de projet —, avec ces garde-fous :
   - code de 8 caractères, **valable 7 jours**, **usage unique**, empreinte HMAC seulement (comme ADR-0013) — décision du porteur de projet ;
   - **3 proches au plus par patient** (paramétrable) — décision du porteur de projet ;
   - à l'activation du compte du proche, le patient le voit dans « Mes partages et accès » (« Votre proche Serge [FICTIF] a créé son compte ») et peut **retirer** le partage d'un geste ;
   - lecture toujours réduite (`documents.proche`) et tracée.
4. **Données du proche** — décision du porteur de projet : **prénom** (pour que le patient le reconnaisse) et **lien** (enfant, conjoint, frère ou sœur, parent, autre ; codes `v3-RoleCode`). Ni nom, ni e-mail, ni date de naissance ; le numéro de téléphone n'est utilisé que le temps d'envoyer le code (point 2).
5. **Consentement** : le patient accepte le texte `C-PROCHE` **au moment d'inviter**, pour ce proche nommé ; jamais pré-coché, révocable dans « Mes partages et accès ». Le texte est un brouillon tant que le juriste ne l'a pas validé.
6. **Inscription du proche** : même formulaire Keycloak que le patient (ADR-0014). Le service `invitations` indique à l'extension le **type** du code :
   - code patient → rôle `patient` (inchangé) ;
   - code proche → rôle `proche` et attribut `related_person_id` fournis **par le serveur** ;
   - liste fermée de rôles, vérifiée par test : jamais `professionnel`, `administrateur`, etc.
   - Le proche ne passe pas par l'action « Mon identité » (réservée aux patients).
7. **Double authentification du proche obligatoire** — décision du porteur de projet : code à usage unique (OTP) en plus du mot de passe, configuré à la première connexion, comme pour les professionnels (ADR-0009). Le proche voit des données de santé d'une autre personne : un mot de passe seul ne suffit pas.
8. Tout est derrière le flag `consentement.proche` (inviter) et `documents.proche` (lire).

## Conséquences

- **Code**, en petites PR :
  1. `invitations` : codes « proche » créés par le patient lui-même (limite par patient, validité 7 jours), `RelatedPerson` inactive, consentement `C-PROCHE`, envoi du code par SMS (gabarit fermé `invitation-proche`, numéro jamais gardé) ;
  2. extension Keycloak : type de code → rôle `proche` et `related_person_id` ; activation de la fiche ; double authentification obligatoire du rôle `proche` ; tests de la liste fermée des rôles ;
  3. application patient : « Inviter un proche » (prénom, lien, texte `C-PROCHE`, code à transmettre) ; « Votre proche a créé son compte » dans « Mes partages et accès » ;
  4. e2e : invitation, inscription du proche, lecture réduite, retrait.
- **Registre des traitements** : proches (prénom, lien, compte) ; transfert hors du pays si le proche vit à l'étranger.
- **Modèle de menaces** : code intercepté ou transmis à la mauvaise personne ; patient sous pression d'un proche ; proche malveillant.
- **Hors périmètre** : abonnement Diaspora Famille (paiement par carte, ADR-0017) ; mineurs et majeurs protégés (avis juridique) ; un proche qui aide plusieurs patients (un compte par patient en vague 2).

## Suivi

- **Invitations de proches** (PR BG) : service `invitations` (routes `/proches`, 3 proches, 7 jours, verrou par patient), fiche `RelatedPerson` minimale (règles `mbolo-proche-1` à `-3`), consentement `C-PROCHE` avec le jeton du patient, SMS par le gabarit fermé `invitation-proche` (numéro jamais gardé), compte de service `mbolo-invitations-service` (`system/RelatedPerson.cru`). **Tant que l'extension Keycloak n'est pas à jour, un code de proche est refusé à l'inscription** : il ne peut jamais créer un compte patient.
- **Inscription du proche** (PR BH) : l'extension Keycloak déclare les types de codes qu'elle traite ; le type fixé par le service donne le rôle (liste fermée `patient` / `proche`, testée) ; un proche reçoit `related_person_id`, configure la double authentification dès l'inscription (le rôle `proche` inclut `mfa-requise`), sans saisie d'identité ; sa fiche est activée. Le patient peut **retirer un proche** qui a déjà son compte : partage retiré, fiche désactivée, place libérée.
- **Écran « Mes proches »** (PR BI) dans « Mes partages et accès » de l'application patient : inviter (prénom, lien, numéro international, texte `C-PROCHE` brouillon), code affiché en secours, retirer ; le partage avec un proche porte son prénom. Le parcours de l'ADR-0019 est complet ; reste la validation des textes par le juriste avant d'ouvrir `consentement.proche`.

## Réponses du porteur de projet (2026-09-28)

1. **Code envoyé par SMS au proche.** Moment de la saisie du numéro : **par le patient, à l'invitation** (confirmé) ; numéro non conservé après l'envoi.
2. **Pas de vérification d'identité** du proche.
3. Données du proche : **prénom et lien** seulement.
4. **3 proches** au plus, code valable **7 jours**.
5. **Double authentification obligatoire** pour les proches.

Sources :

- ADR-0009 (identité, consentements), ADR-0013 (invitations), ADR-0014 (inscription), ADR-0015 (vérification d'identité), ADR-0017 (paiement) ;
- skill `recueil-consentement` (`C-PROCHE`) ; `docs/deploiement/flags.md` ;
- HL7 FHIR R4 — [RelatedPerson](https://hl7.org/fhir/R4/relatedperson.html), [v3-RoleCode](https://terminology.hl7.org/CodeSystem-v3-RoleCode.html).
