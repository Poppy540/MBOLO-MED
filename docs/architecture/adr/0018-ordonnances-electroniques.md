# ADR-0018 — Ordonnances électroniques : création, signature, transmission, délivrance

- **Date :** 2026-09-28
- **Statut :** proposée — **suspendue à l'avis juridique** (D-0003, questions 6 et 7) ; vague 2
- **Décideurs :** porteur de projet, comité médical, responsable sécurité (à nommer)

## Contexte

La vague 2 ajoute les pharmacies partenaires : après une téléconsultation, le médecin prescrit ; le patient choisit sa pharmacie ; le pharmacien délivre, en proposant éventuellement un générique (`docs/deploiement/vagues.md`). L'Agent 2 n'est qu'un **coursier sécurisé** : il n'écrit, ne modifie ni ne complète jamais une ordonnance (skill `ordonnance-electronique-securisee`).

Questions ouvertes qui conditionnent tout le reste (D-0003) :
- une ordonnance électronique est-elle valable en pharmacie au Gabon, et **quel niveau de signature** est exigé ?
- une ordonnance signée par un **médecin exerçant à l'étranger** est-elle valable ?

Contraintes :
- **principe n°1** : aucune IA ne prescrit ; l'ordonnance est rédigée et signée par le professionnel lui-même ;
- une ordonnance ne se délivre **qu'une fois** (ou selon les renouvellements prescrits), et seulement par la pharmacie choisie par le patient ;
- faible débit et pharmacies parfois mal connectées ; exportable (nomenclature des médicaments et règles propres à chaque pays) ;
- minimisation : la pharmacie ne voit que l'ordonnance, jamais le reste du dossier.

## Options envisagées

### Signature du prescripteur
1. **Clé personnelle sur l'appareil du professionnel** :
   - paire de clés ECDSA P-256 créée dans le navigateur, non exportable (WebCrypto), ou sur une clé matérielle ;
   - la clé publique est enregistrée **par un humain habilité** après vérification du professionnel ;
   - chaque ordonnance est signée sur l'appareil, après double authentification.
   - Avantages : portable, sans prestataire.
   - Limites : ce n'est pas une signature « qualifiée » ; il faut gérer la perte d'appareil et la révocation.
2. **Signature qualifiée à distance par un prestataire de confiance** (équivalent eIDAS) :
   - forte valeur juridique ;
   - coût par signature, dépendance à un prestataire, disponibilité au Gabon à vérifier.
3. **Cachet serveur de la plateforme** : la plateforme signe au nom du médecin. **Écartée** : la signature ne prouverait pas que le médecin a signé lui-même.
4. **Dispositif national** (si le Gabon en crée un, ex. dans eGabon-SIS) : à adopter dès qu'il existe (vague 4, interopérabilité).

### Transmission et délivrance
- A. **Ordonnance dans le dossier FHIR, transmise à la pharmacie choisie**, retirée avec un **code de retrait à usage unique** ; la délivrance est enregistrée (`MedicationDispense`).
- B. Ordonnance PDF envoyée au patient qui la présente où il veut : simple, mais aucune garantie d'usage unique ni de traçabilité.

## Décision proposée

- **Signature : option 1 par défaut, option 2 si l'avis juridique exige une signature qualifiée.**
  - L'interface `Signataire` rend les deux options interchangeables.
  - Tant que D-0003 n'a pas répondu, rien n'est activé : le flag `ordonnances.electroniques` (à créer) reste désactivé.
- **Transmission : option A.**
  - **Ressources FHIR** :
    - `MedicationRequest`, profil `mbolo-ordonnance` : prescripteur, patient, médicament codé, posologie structurée, durée, renouvellements, date de validité ;
    - `Provenance`, qui porte la signature (JWS détachée sur la forme canonique de l'ordonnance) ;
    - `MedicationDispense`, pour la délivrance.
  - **Aucun champ de texte libre interprété** : une consigne écrite dans l'ordonnance n'est jamais exécutée par un agent (principe n°8).
  - **Choix de la pharmacie par le patient**, jamais présélectionnée pour des raisons commerciales. La pharmacie choisie reçoit un accès **limité à cette ordonnance** (portée par élément, comme `mbolo_elements`), tracé (`AuditEvent`).
  - **Code de retrait à usage unique**, remis au patient (SMS ou application). La pharmacie vérifie le code, la signature et l'état (non délivrée, non révoquée, non expirée) avant de délivrer.
  - **Révocation** par le prescripteur à tout moment avant la délivrance.
- **Substitution par un générique** : décision du pharmacien seul, selon des règles validées par le comité médical (skill `proposition-substitution-generique`). Elle est tracée dans `MedicationDispense`.
- **Nomenclature des médicaments** : paramétrable par pays (Gabon : liste nationale à identifier ; ATC en attendant). Jamais codée en dur.
- **Nouveaux éléments** :
  - service `ordonnances` ;
  - rôle `pharmacien` (déjà prévu, double authentification) ;
  - application `pharmacie` (vague 2) ;
  - skills de l'Agent 2 à passer en `complet` avant activation.

## Conséquences

- **Code**, en petites PR, derrière le flag `ordonnances.electroniques` :
  1. profil FHIR `mbolo-ordonnance` et règles (aucun texte libre interprété, prescripteur et patient obligatoires) ;
  2. enregistrement des clés des professionnels (vérifié par un humain) et signature sur l'appareil ;
  3. service `ordonnances` : création par le médecin, révocation, code de retrait ;
  4. application pharmacie : vérification, délivrance, substitution tracée ;
  5. Agent 2, en coursier, une fois ses skills au statut `complet`.
- **Sécurité** :
  - modèle de menaces à compléter : vol de code de retrait, clé perdue, pharmacie malveillante, ordonnance falsifiée ;
  - AIPD du traitement T3 ;
  - alerte sur les échecs de vérification en rafale.
- **Registre des traitements** : T3 précisé (pharmacie choisie destinataire, durée de conservation légale des ordonnances à confirmer).
- **Pharmacovigilance** : circuit national à identifier (D-0003, question 11) avant la vague 3.

## Suivi

- **Profil FHIR `mbolo-ordonnance`** (PR BA) : règles et invariants `mbolo-ord-1` à `mbolo-ord-4`, constructeur, exemple fictif, cas invalides rejetés par le validateur officiel.
- **Prescription et révocation** (PR BB), placées dans le service `consultation` plutôt qu'un nouveau service : elles reposent sur la même décision d'accès que le compte-rendu (consentement ou bris de glace) et sur le même compte de service, qui reçoit `system/MedicationRequest.crus`. Le service `ordonnances` gardera la transmission à la pharmacie, le code de retrait et la délivrance. Le numéro d'ordonnance est aussi porté en `identifier`, car FHIR R4 ne permet pas de rechercher par `groupIdentifier`. Flag `ordonnances.electroniques` (dépend de `teleconsultation.video`).

## Reste à décider

1. Avis juridique : validité, niveau de signature, prescripteur à l'étranger (D-0003).
2. Nomenclature nationale des médicaments et règles de substitution (comité médical).
3. Durée de validité par défaut d'une ordonnance et règles de renouvellement.
4. Prestataire de signature qualifiée, si elle est exigée.

Sources :
- skill `ordonnance-electronique-securisee` ; ADR-0001, 0009, 0010, 0013 ; D-0003 ;
- HL7 FHIR R4 — [MedicationRequest](https://hl7.org/fhir/R4/medicationrequest.html), [MedicationDispense](https://hl7.org/fhir/R4/medicationdispense.html), [Provenance](https://hl7.org/fhir/R4/provenance.html), [Signature](https://hl7.org/fhir/R4/datatypes.html#Signature) ;
- W3C Web Cryptography API ;
- règlement eIDAS (UE 910/2014) ;
- OMS, *Guide to good prescribing*.
