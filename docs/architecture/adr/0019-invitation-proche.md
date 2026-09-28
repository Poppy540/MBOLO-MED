# ADR-0019 — Le patient invite un proche depuis son application

- **Date :** 2026-09-28
- **Statut :** proposée — décisions attendues du porteur de projet (voir « Questions ») ; vague 2
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

## Décision proposée

1. **Fiche créée à l'invitation (option A)**, par le service `invitations`, avec le compte de service qui reçoit `system/RelatedPerson.cu` (création, puis activation).
2. **Code affiché au patient (option 1)** : aucun numéro du proche n'est collecté. Le texte à transmettre est prêt (« Voici ton code Mbolo Santé : … »), avec le bouton de partage du téléphone.
3. **Pas de vérification d'identité du proche (option I)** en vague 2, avec ces garde-fous :
   - code de 8 caractères, **valable 7 jours**, **usage unique**, empreinte HMAC seulement (comme ADR-0013) ;
   - **3 proches au plus par patient** (paramétrable) ;
   - à l'activation du compte du proche, le patient le voit dans « Mes partages et accès » (« Votre proche Serge [FICTIF] a créé son compte ») et peut **retirer** le partage d'un geste ;
   - lecture toujours réduite (`documents.proche`) et tracée.
4. **Données du proche** : **prénom** (pour que le patient le reconnaisse) et **lien** (enfant, conjoint, frère ou sœur, parent, autre ; codes `v3-RoleCode`). Ni nom, ni téléphone, ni e-mail, ni date de naissance.
5. **Consentement** : le patient accepte le texte `C-PROCHE` **au moment d'inviter**, pour ce proche nommé ; jamais pré-coché, révocable dans « Mes partages et accès ». Le texte est un brouillon tant que le juriste ne l'a pas validé.
6. **Inscription du proche** : même formulaire Keycloak que le patient (ADR-0014). Le service `invitations` indique à l'extension le **type** du code :
   - code patient → rôle `patient` (inchangé) ;
   - code proche → rôle `proche` et attribut `related_person_id` fournis **par le serveur** ;
   - liste fermée de rôles, vérifiée par test : jamais `professionnel`, `administrateur`, etc.
   - Le proche ne passe pas par l'action « Mon identité » (réservée aux patients).
7. **Double authentification du proche** : non obligatoire en vague 2 (comme le patient), à confirmer.
8. Tout est derrière le flag `consentement.proche` (inviter) et `documents.proche` (lire).

## Conséquences

- **Code**, en petites PR :
  1. `invitations` : codes « proche » créés par le patient lui-même (limite par patient, validité 7 jours), `RelatedPerson` inactive, consentement `C-PROCHE` ;
  2. extension Keycloak : type de code → rôle `proche` et `related_person_id` ; activation de la fiche ; tests de la liste fermée des rôles ;
  3. application patient : « Inviter un proche » (prénom, lien, texte `C-PROCHE`, code à transmettre) ; « Votre proche a créé son compte » dans « Mes partages et accès » ;
  4. e2e : invitation, inscription du proche, lecture réduite, retrait.
- **Registre des traitements** : proches (prénom, lien, compte) ; transfert hors du pays si le proche vit à l'étranger.
- **Modèle de menaces** : code intercepté ou transmis à la mauvaise personne ; patient sous pression d'un proche ; proche malveillant.
- **Hors périmètre** : abonnement Diaspora Famille (paiement par carte, ADR-0017) ; mineurs et majeurs protégés (avis juridique) ; un proche qui aide plusieurs patients (un compte par patient en vague 2).

## Questions au porteur de projet

1. Code **affiché au patient** (proposé) ou **envoyé par SMS** au proche ?
2. **Pas de vérification d'identité** du proche (proposé) ou photos, comme pour le patient ?
3. Données du proche : **prénom et lien** seulement (proposé) ?
4. **3 proches** au plus et code valable **7 jours** (proposé) ?
5. **Double authentification** pour les proches : non (proposé) ou oui ?

Sources :

- ADR-0009 (identité, consentements), ADR-0013 (invitations), ADR-0014 (inscription), ADR-0015 (vérification d'identité), ADR-0017 (paiement) ;
- skill `recueil-consentement` (`C-PROCHE`) ; `docs/deploiement/flags.md` ;
- HL7 FHIR R4 — [RelatedPerson](https://hl7.org/fhir/R4/relatedperson.html), [v3-RoleCode](https://terminology.hl7.org/CodeSystem-v3-RoleCode.html).
