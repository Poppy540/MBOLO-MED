# Plan de réponse aux incidents — Mbolo Santé

> Squelette (skill `reponse-incident`). À tester par un exercice sur table avant la vague 1.

## Gravité
| Niveau | Exemples | Délai d'alerte |
|---|---|---|
| **Critique** | Urgence patient mal orientée ; fuite de données de santé ; ordonnance altérée ; secret exposé | **Immédiat** |
| Élevé | Indisponibilité de la téléconsultation ; agent qui sort de son périmètre | < 1 h |
| Moyen | Dégradation de performance ; anomalie de paiement | < 24 h |

## Circuit d'alerte
- Sécurité patient → **directeur médical de garde** (+ porteur de projet informé).
- Sécurité des données → **responsable sécurité** (+ porteur de projet informé).
- L'Agent 6 alerte ; il ne retarde jamais une alerte ; il n'agit pas en production.
- Canal : Slack (`#alertes-patients`, `#alertes-securite`) **et** astreinte Grafana OnCall qui appelle ou envoie un SMS (ADR-0006). Une alerte critique ne dépend jamais du seul chat.

Destinataires par type d'alerte et délais d'escalade : [ADR-0016](../architecture/adr/0016-preparation-production.md) (rôles ; titulaires à désigner).

## Étapes
1. Détecter et qualifier. 2. Contenir (désactiver un flag, révoquer une clé — par un humain). 3. Éradiquer. 4. Rétablir. 5. Notifier (autorités, personnes concernées si requis). 6. Retour d'expérience → `memory.md` (leçons apprises) et fiche problématique.

## Scénario : fuite de photos d'identité (ADR-0015) — brouillon, à valider

**Signaux** : consultation anormale dans les traces (volume, horaires, vérificateur inhabituel) ; accès inconnu au stockage objet ou à la base ; clé maître ou clés du stockage exposées ; signalement d'un patient (historique des accès).

**Gravité** : critique. Alerte immédiate du responsable sécurité et du porteur de projet.

**Contenir** (décidé et fait par un humain) :
1. **Désactiver le flag `identite.photos`** : plus aucun nouvel envoi.
2. **Retirer le rôle `verification-identite`** au compte en cause, ou à tous, et révoquer ses sessions dans Keycloak.
3. **Changer les clés du stockage** (`STORAGE_*`) et, si la base est touchée, les mots de passe de la base.
4. **Si la clé maître est exposée** : configurer une nouvelle clé comme actuelle, lancer la commande de rotation du service `documents` (ré-enveloppement sans déchiffrer les photos, reprise possible), puis retirer l'ancienne. **Dernier recours** : détruire la clé maître dans le KMS (opération réservée à deux personnes), ce qui rend toutes les photos illisibles pour toujours. Les patients devront alors renvoyer leurs photos ; le résultat des vérifications déjà faites reste dans le dossier.

**Évaluer** : quelles photos, quels patients, depuis quand (traces `AuditEvent` de motif `verification-identite`, décisions du schéma `documents`, journaux du stockage).

**Notifier** (si requis, avec le juriste) : autorité de protection des données (Gabon : CNPDCP ; UE : autorité du pays) et **patients concernés**, en phrases simples, avec les mesures à prendre (vigilance sur l'usurpation d'identité) `[À CONFIRMER : délais légaux]`.

**Retour d'expérience** : fiche problématique, `memory.md`, mise à jour de l'[AIPD n°1](aipd-verification-identite.md) et du [modèle de menaces](modele-menaces.md).

## Procédure : couper un compte compromis (professionnel ou équipe) — brouillon, à valider

Écart E2 de l'[exercice sur table n°1](exercice-sur-table-01.md). À appliquer dès qu'un compte est **soupçonné** d'être utilisé par quelqu'un d'autre. Exemples : alerte `LecturesDossiersEnSerie` ou `AccesRefusesEnRafale`, bris de glace inexpliqué, signalement du titulaire ou d'un patient. Dans le doute, on coupe : un compte coupé à tort se rétablit, une fuite ne se rattrape pas.

**Qui** : le responsable sécurité décide ; l'astreinte technique agit dans la console d'administration de Keycloak, avec sa double authentification. Le porteur de projet est informé. Un agent IA ne fait jamais ces gestes.

**Couper (en moins de 30 minutes après l'alerte)**, dans la console Keycloak, royaume `mbolo`, fiche de l'utilisateur :

1. **Désactiver le compte** (« Enabled » sur off) : plus aucune connexion ni aucun renouvellement de jeton.
2. **Fermer toutes ses sessions** (onglet « Sessions », « Sign out ») : les jetons de rafraîchissement sont révoqués.
3. **Supprimer son code de double authentification** (onglet « Credentials ») : le code volé ne servira plus, même après réactivation.
4. **Retirer le compte des téléconsultations en cours** : `POST /securite/retrait-salles` du service `teleconsultation` (voir ci-dessous).
5. Noter l'heure exacte de chaque geste dans le journal d'incident (`control-room/incidents/INC-AAAA-NNN.md`, voir le skill `reponse-incident`).

**Ce que la coupure ne fait pas encore** (à connaître, à surveiller) :

- **Jeton d'accès déjà délivré** : il reste accepté **jusqu'à 5 minutes**, car les services vérifient la signature localement (`accessTokenLifespan` = 300 s). Après 5 minutes, plus rien ne passe.
- **Téléconsultation en cours** : un participant déjà dans une salle y reste après la coupure. Juste après les gestes ci-dessus, le responsable sécurité le retire de toutes les salles ouvertes avec `POST /securite/retrait-salles` `{ sujet }` du service `teleconsultation` (rôle `responsable-securite`, double authentification ; le `sujet` est l'identifiant Keycloak du compte, celui des alertes). Le compte doit d'abord être désactivé : sinon il redemande un jeton de salle et revient. Un jeton de salle déjà délivré permet encore d'entrer pendant 10 minutes au plus ; refaire le retrait si besoin, ou annuler le rendez-vous en dernier recours (le patient est alors prévenu).
- **Fiche du professionnel** : elle reste « vérifiée ». **Ne pas utiliser la suspension** (`POST /professionnels/:id/suspension`) pour un compte volé : elle remet le professionnel en vérification complète, et ses motifs (signalement de l'Ordre, plainte confirmée, incident qualité) ne correspondent pas. Elle ne sert que si c'est le professionnel lui-même qui est en cause.
- **Rendez-vous à venir** : ils ne sont pas annulés. Tant que la fiche reste vérifiée, ils n'apparaissent pas dans « Rendez-vous à reprendre » (écart E5). L'assistance les reprend à la main si la coupure dure.

**Vérifier (dans les 15 minutes suivantes)** :

- plus aucune connexion réussie de ce compte dans les événements de Keycloak (événements de connexion et d'administration activés dans le royaume) ;
- plus aucun accès accordé à ce compte dans les traces du dossier (`AuditEvent`) après l'heure de coupure + 5 minutes ;
- la fin des alertes `LecturesDossiersEnSerie` et `AccesRefusesEnRafale` pour ce compte.

**Établir ce que le compte a obtenu** : le responsable sécurité liste toutes les traces du compte depuis le début de la période suspecte avec `GET /securite/traces-compte?sujet=…&depuis=…` du service `identite` (rôle `responsable-securite`, 30 jours au plus). La réponse distingue les accès refusés (rien de lu), les accès accordés et les bris de glace, et donne la liste des dossiers obtenus (`dossiersAccordes`). La recherche sert aussi à la vérification ci-dessus (plus aucun accès accordé après la coupure) et à l'évaluation de la notification. Elle est elle-même journalisée.

**Ne jamais** :

- supprimer le compte : ses traces doivent rester rattachées à un compte existant ;
- effacer des journaux ou des traces ;
- prévenir le titulaire par le canal qui a pu être compromis (courriel ou téléphone inconnu) : utiliser les coordonnées connues de l'équipe.

**Rétablir** (décidé par le responsable sécurité, jamais le jour même sans contact direct) :

1. Joindre le titulaire par un canal déjà connu et confirmer son identité. Pour un professionnel, appeler l'équipe `verification-professionnels`, qui a vérifié son identité.
2. Lui imposer un nouveau mot de passe temporaire et une nouvelle double authentification (actions requises « Update Password » et « Configure OTP »).
3. Réactiver le compte, puis noter l'heure et la décision dans le journal d'incident.
4. Revoir avec lui les accès faits pendant la période suspecte : ils alimentent l'évaluation de la notification (étape 5 des étapes ci-dessus).

**Compte d'un patient** : même coupure. Le rétablissement passe ensuite par la récupération du compte avec l'équipe `assistance-patient` (ADR-0021) : code remis après rappel au numéro du dossier, autres sessions fermées, SMS d'alerte.

## Exercices sur table

| N° | Scénario | État |
|---|---|---|
| 1 | [Compte professionnel compromis](exercice-sur-table-01.md) (hameçonnage, refus en série, bris de glace) | Brouillon v0.1, à valider puis à jouer avant la vague 1 ; 7 écarts pressentis (E1 à E7), E1 corrigé (règle `LecturesDossiersEnSerie`), E2 traité (procédure ci-dessus) |

## Contacts (à compléter — rôles, pas de données personnelles dans le dépôt)
Directeur médical de garde · Responsable sécurité · Porteur de projet · Hébergeur · Prestataires critiques.
