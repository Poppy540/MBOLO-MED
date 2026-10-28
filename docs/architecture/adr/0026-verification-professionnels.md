# ADR-0026 — Recrutement et vérification des professionnels de santé

- **Date :** 2026-10-06
- **Statut :** proposée (choix du porteur de projet du 2026-10-06 d'ouvrir ce chantier ; réponses attendues aux questions de la fin)
- **Décideurs :** porteur de projet ; juriste (conditions d'exercice, conservation des pièces) ; comité médical (critères par spécialité)

## Contexte

Un critère de passage vers la vague 1 exige « **au moins N médecins recrutés et vérifiés par un humain** » (`docs/deploiement/vagues.md`). Les professionnels viennent **du monde entier** (D-0001) ; la question de l'exercice au Gabon par un médecin inscrit à l'étranger est ouverte (D-0003).

Aujourd'hui :

- Un compte professionnel n'existe que s'il est créé à la main dans Keycloak (comptes de test) ; sa fiche `Practitioner` est écrite directement dans le dossier. **Rien n'enregistre qui a vérifié le diplôme ni l'inscription à l'Ordre**, ni quand.
- L'annuaire de l'application patient montre **tout professionnel qui a un agenda** (`teleconsultation`, PR n°23) : rien n'empêche un compte non vérifié de publier des créneaux.
- L'Agent 3 (recrutement) a ses skills en `v1` : il **prépare** (pré-vérification dans les registres publics, liste d'onboarding), il **ne décide jamais** et n'active aucun compte (`agents/agent-03-recrutement/`).
- Les services savent déjà : stocker des pièces chiffrées (`documents`, ADR-0015), créer des codes d'invitation à usage unique (`invitations`, ADR-0013), faire décider un rôle humain avec double authentification et tracer chaque consultation de pièce (vérification d'identité des patients, PR n°43).

## Décision proposée

### 1. Le professionnel entre sur invitation, jamais par une inscription ouverte

- L'équipe de recrutement (rôle humain **`recrutement`**, double authentification) crée un **code d'invitation de type `professionnel`** (service `invitations`, même mécanisme que pour les patients : empreinte HMAC, usage unique, durée limitée) et le remet au candidat après un premier échange.
- Le candidat crée son compte Keycloak avec ce code. Il reçoit un **rôle d'attente `professionnel-candidat`** : il peut seulement compléter son dossier et suivre son état. **Aucun accès au dossier médical, aucun agenda, aucune consultation.**
- La double authentification (application d'authentification) est configurée dès la création du compte, comme pour tous les professionnels (ADR-0009).

### 2. Un dossier de candidature, avec des pièces chiffrées

- Le candidat déclare : nom, prénoms, profession et spécialité (liste fermée par pays), **pays et numéro d'inscription à l'Ordre**, langues de consultation.
- Il dépose les **pièces** : diplôme, attestation d'inscription à l'Ordre (de moins de 3 mois), pièce d'identité, attestation d'assurance de responsabilité civile professionnelle si le juriste l'exige. Elles sont stockées par le service `documents`, chiffrées par pièce (ADR-0015), sans image dans les métadonnées.
- Le candidat accepte une **charte d'information** (`C-VERIFICATION-PRO`, brouillon à valider par le juriste) : à quoi servent ses pièces, qui les voit, combien de temps elles sont gardées. Les professionnels européens relèvent du RGPD.
- La fiche `Practitioner` du dossier est créée **inactive** (`active = false`), avec une extension `statut-verification` : `a-verifier`.

### 3. La vérification est faite par une personne habilitée, jamais par un agent IA

- Un rôle humain distinct, **`verification-professionnels`** (double authentification), examine le dossier dans l'espace professionnel. **Séparation des tâches** : la personne qui a recruté un candidat ne peut pas le vérifier (contrôlé par le service). **Décision du porteur de projet du 2026-10-28** : le service `documents` demande au service `invitations`, qui garde l'auteur de chaque code, qui a recruté la fiche (question réservée au compte de service `documents`) ; rien de plus dans le dossier médical.
- Pour chaque point (identité, diplôme, inscription à l'Ordre, spécialité), elle consulte la **source officielle** (registre public de l'Ordre du pays d'inscription, ou attestation directe de l'Ordre) et enregistre : la source, la date, le résultat. Un entretien vidéo court confirme l'identité (visage et pièce).
- L'Agent 3 peut **préparer** une pré-vérification (skill `pre-verification-inscription-ordinale`), affichée comme telle : elle **ne remplace jamais** la consultation de la source par la personne habilitée.
- Décision : **vérifié**, **refusé** (motif dans une liste fermée), ou **à compléter** (pièce illisible, attestation trop ancienne). Chaque consultation de pièce et chaque décision est tracée dans le dossier (`AuditEvent`) avant l'affichage, comme pour les patients.

### 4. Activation : seulement après la décision, par le serveur

- Sur décision « vérifié », le service met la fiche `Practitioner` à `active = true`, `statut-verification = verifie`, avec la **qualification structurée** (spécialité codée, numéro d'inscription, Ordre émetteur, période de validité), et remplace dans Keycloak le rôle `professionnel-candidat` par **`professionnel`**. Aucun humain ni agent IA n'attribue ce rôle à la main. **Décision du porteur de projet du 2026-10-28** : le rôle change **à la connexion**, par une extension Keycloak qui lit la fiche du dossier (fiche active et vérifiée → `professionnel`, rôle d'attente retiré) ; aucun service ne détient de droit d'administration sur les comptes, et la même extension retirera le rôle d'un professionnel suspendu (étape 5). Le candidat se reconnecte une fois après la décision.
- **L'annuaire et la publication de créneaux exigent `active = true` et `verifie`** (service `teleconsultation`) : un compte non vérifié, suspendu ou dont l'inscription a expiré ne peut ni publier de créneaux ni apparaître aux patients.

### 5. Suivi dans le temps

- **Échéance** : la date de fin de validité de l'attestation (ou une revérification périodique) déclenche une alerte au rôle `verification-professionnels` 30 jours avant ; à l'échéance, sans nouvelle vérification, la fiche passe en `a-verifier` et le professionnel sort de l'annuaire.
- **Suspension** : le rôle `verification-professionnels` peut suspendre un professionnel (signalement de l'Ordre, plainte, incident qualité de l'Agent 4 confirmé par la direction médicale) ; motif dans une liste fermée, tracé. Les rendez-vous à venir sont **signalés à l'équipe** (pas annulés automatiquement : un humain prévient les patients et propose un autre médecin).
- **Pièces** : supprimées automatiquement à l'échéance de conservation (destruction de clé, ADR-0015) ; la décision et ses sources restent dans le dossier.

### 6. Mise en œuvre proposée (petites PR)

1. **Profil FHIR** `MboloPraticien` (extension `statut-verification`, qualification structurée, règles : actif seulement si vérifié) et **filtre de l'annuaire et des créneaux** dans `teleconsultation` (les professionnels de test deviennent « vérifiés » dans les données fictives). **Fait** : règles `mbolo-prat-1` et `-2`, `praticienVerifie` (fiche active, vérifiée, inscription encore valable), annuaire, publication, réservation et report refusés sinon.
2. **Invitations et inscription** : code de type `professionnel`, rôle `professionnel-candidat`, fiche inactive (extension Keycloak, liste fermée `RolesInscription`). **Fait** : `POST/GET /professionnels` et révocation (rôle `recrutement`, flag `professionnels.recrutement`), fiche `Practitioner` inactive « à vérifier » créée avec le nom donné par le candidat, code à usage unique ; inscription : rôle `professionnel-candidat` et `practitioner_id`, double authentification ; aucun accès aux patients.
3. **Dossier de candidature** : déclaration, charte `C-VERIFICATION-PRO`, pièces dans `documents`, écran dans l'espace professionnel. **3a fait** : charte (brouillon `docs/securite/charte-verification-professionnels.md`, décisions gardées, la dernière fait foi) et pièces chiffrées dans `documents` (`GET /candidature`, `POST /candidature/charte`, `POST /candidature/pieces/:type`, rotation et suppression à échéance). **3b fait** : déclaration (`PUT /candidature/declaration` : spécialité dans une liste fermée provisoire `mbolo-specialite`, à valider par le comité médical ; pays et numéro d'inscription à l'Ordre ; langues de consultation) écrite dans `Practitioner.qualification` et `.communication` seulement, sans période de validité (donc jamais « vérifiée »), tant que la fiche est inactive et à vérifier, avec verrou optimiste. **3c fait** : écran « Ma candidature » de l'espace professionnel (charte, déclaration par listes fermées, photos des pièces réduites sur l'appareil, état du dossier ; aucun menu de soignant). Étape 3 entièrement codée.
4. **Vérification** : écran du rôle `verification-professionnels`, sources et résultats point par point, décision, activation par le serveur, séparation des tâches. En 4 PR : **4a-1** recruteurs d'une fiche (`invitations`, `GET /service/professionnels/:practitionerId/recruteurs`, compte de service `documents` seul) ; **4a-2** vérification et décision dans `documents` (rôle `verification-professionnels`, dossier et pièces tracés avant affichage, points et sources en listes fermées, vérifié / refusé / à compléter, activation de la fiche par le serveur, séparation des tâches) ; 4b extension Keycloak qui donne le rôle à la connexion ; 4c écran.
5. **Échéances et suspension** : alertes, sortie de l'annuaire, signalement des rendez-vous à venir.

Chaque PR a ses scénarios e2e (nominal, refus, accès interdit) avec des professionnels **fictifs**.

## Conséquences

- **Positives :** le critère « N médecins vérifiés par un humain » devient mesurable et prouvé (qui, quand, quelle source) ; aucun compte non vérifié ne peut recevoir de patient ; mêmes briques que la vérification des patients (pièces chiffrées, traces, double authentification).
- **Négatives :** un circuit de plus à tenir par des personnes habilitées (temps de vérification par candidat) ; des pièces de professionnels à protéger (nouveau traitement au registre, AIPD à évaluer).
- **Risques :** une fausse attestation qui passe la vérification (d'où la consultation de la source officielle, pas seulement de la pièce) ; une source étrangère difficile à consulter (d'où l'attestation directe de l'Ordre comme alternative).

## Questions au porteur de projet

1. **Exercice depuis l'étranger** (D-0003) : un médecin inscrit hors du Gabon peut-il consulter des patients gabonais ? Faut-il une inscription ou une autorisation au Gabon ? Cela fixe la liste des pièces.
2. **Pièces exigées** : diplôme, attestation d'inscription de moins de 3 mois, pièce d'identité ; l'assurance de responsabilité civile professionnelle est-elle obligatoire ? D'autres pièces par spécialité ?
3. **Qui vérifie** (titulaires du rôle `verification-professionnels`) et **qui recrute** (rôle `recrutement`) ? La séparation des tâches proposée vous convient-elle ?
4. **Entretien vidéo** d'identité obligatoire pour chaque candidat ?
5. **Durée de conservation des pièces** après la décision (proposé : jusqu'à la fin de la collaboration + 1 an pour les pièces ; la décision et ses sources sont gardées) ; et pour un candidat refusé (proposé : 6 mois) ?
6. **Revérification** : à l'échéance de l'attestation seulement, ou aussi chaque année ?
7. **N**, le nombre de médecins vérifiés exigé pour passer en vague 1, et leur répartition (médecine générale à Libreville d'abord).
8. **Contrat** : signé hors de la plateforme (l'équipe coche « contrat signé » avant l'activation) ou dans la plateforme plus tard ?

## Sources

- Décision D-0001 et vagues (`docs/deploiement/vagues.md`, critère « N médecins vérifiés par un humain »).
- Agent 3 : `agents/agent-03-recrutement/` (skills `pre-verification-inscription-ordinale`, `onboarding-professionnels`).
- ADR-0009 (identité et contrôle d'accès), ADR-0013 (invitations), ADR-0015 (stockage chiffré des documents).
- HL7 FHIR R4, ressource `Practitioner` (`active`, `qualification`) — https://hl7.org/fhir/R4/practitioner.html
- Conseil national de l'Ordre des médecins (France), annuaire public — https://www.conseil-national.medecin.fr/annuaire
- General Medical Council (Royaume-Uni), registre public — https://www.gmc-uk.org/registration-and-licensing/the-medical-register
- OMS, *Global Code of Practice on the International Recruitment of Health Personnel* (2010) — https://www.who.int/publications/i/item/wha63.16
