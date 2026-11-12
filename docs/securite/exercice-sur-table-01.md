# Exercice sur table n°1 — Compte professionnel compromis — BROUILLON v0.1

> **Brouillon préparé par l'Agent 6 le 2026-11-02**, à valider par le porteur de projet et le responsable sécurité avant d'être joué.
>
> - Critère 8 du passage en vague 1 : « Plan d'incident testé (exercice sur table) » ([bilan n°2](../../control-room/passages-de-vague/vague-1-2026-11-02.md)).
> - **Tout est fictif** (`[FICTIF]`) : personnes, numéros, dossiers. L'exercice se joue autour d'une table ou en visioconférence, **sans rien toucher en production ni en recette**.
> - Méthode : NIST SP 800-61 (rév. 3), skill `reponse-incident` ; retour d'expérience sans recherche de coupable.

## 1. Objectifs

À la fin de l'exercice, l'équipe sait si elle peut, sans improviser :
1. **reconnaître** une alerte critique et la faire arriver au bon rôle en moins de 15 minutes, de jour comme de nuit ;
2. **contenir** un compte professionnel compromis en moins de 30 minutes après l'alerte : sessions fermées, accès au dossier coupé, sans annuler les soins des autres patients ;
3. **établir** quels dossiers ont été lus, par quel moyen, depuis quand, à partir des traces ;
4. **décider** de la notification (autorité, patients) avec le juriste, et en préparer les textes ;
5. **relever** les manques du plan d'incident, des outils et des rôles.

## 2. Participants (rôles ; aucun nom dans le dépôt)

| Rôle dans l'exercice | Qui le tient | Remarque |
|---|---|---|
| Animateur | Porteur de projet ou responsable sécurité | Distribue les injections, tient le temps, ne donne pas les réponses |
| Responsable sécurité | Titulaire désigné `[À COMPLÉTER]` | Dirige la réponse |
| Astreinte technique | Titulaire désigné `[À COMPLÉTER]` | Seul à « agir » sur Keycloak et les flags (en paroles) |
| Relecteur des bris de glace (`revue-acces`) | Titulaire désigné `[À COMPLÉTER]` | |
| Équipe `assistance-patient` | Un membre | Reçoit l'appel du patient |
| `verification-professionnels` | Un membre | Connaît la fiche du professionnel |
| Directeur médical de garde | Membre du comité médical | Effet sur les soins, rendez-vous à reprendre |
| Juriste ou DPO | Selon disponibilité | Notification |
| Observateur | Agent 6 (salle de contrôle) | Prend la chronologie ; **ne décide rien** |

Durée prévue : **2 heures** (90 minutes de jeu, 30 minutes de retour d'expérience).

## 3. Règles du jeu

- On joue sur ce qui **existe vraiment** : écrans, alertes, rôles et procédures du dépôt. Quand quelque chose manque, on le note et on continue.
- Chaque action est dite à voix haute : « je désactive le compte dans Keycloak », « j'ouvre l'écran de revue des bris de glace ».
- L'animateur peut accélérer le temps (« il est maintenant 03 h 10 »).
- Personne n'est évalué : on évalue le plan et les outils.

## 4. Scénario [FICTIF]

**Situation de départ.**
- Vague 1 ouverte à Libreville. Dr Fictif-Pro-07 [FICTIF], médecin généraliste vérifié, exerce depuis l'étranger.
- Il a reçu un faux courriel « Mbolo Santé : votre compte expire » et a saisi son mot de passe **et son code de double authentification** sur une fausse page, qui les a relayés en direct.
- L'attaquant a ainsi ouvert une session avec son compte.

| Heure de jeu | Injection (remise par l'animateur) | Ce que l'équipe devrait faire ou dire | Ce qui existe aujourd'hui |
|---|---|---|---|
| **02 h 47** | L'attaquant ouvre l'espace professionnel et liste « Mes rendez-vous » : 6 patients [FICTIF]. | Rien n'est visible : c'est un usage normal du compte. | Aucune alerte (normal). |
| **02 h 52** | Il demande le dossier de 40 patients [FICTIF] qui ne sont pas les siens, en 4 minutes. | L'alerte critique doit être reçue et prise en compte. | Règle `AccesRefusesEnRafale` (plus de 20 refus en 5 min pour un même compte) → **responsable sécurité**, gravité critique, appel OnCall. |
| **02 h 58** | Il utilise le **bris de glace** sur 3 dossiers, avec le motif « urgence vitale ». | Relier les deux alertes ; qualifier « critique, sécurité des données » ; prévenir le porteur de projet. | Règle `BrisDeGlace` → `revue-acces` (gravité normale, revue sous 24 h). Les trois accès sont tracés (`AuditEvent`, motif conservé). |
| **03 h 05** | *Question de l'animateur* : qui a été réveillé, par quel canal, et qui décide de couper le compte ? | Responsable sécurité joint ; astreinte technique appelée ; décision prise par un humain. | Circuit dans le plan d'incident et l'ADR-0016 ; **titulaires non désignés**. |
| **03 h 15** | *Question* : comment couper l'accès **tout de suite** ? | 1. Désactiver le compte dans Keycloak et fermer toutes ses sessions. 2. Vérifier qu'aucun jeton encore valable ne permet d'accéder au dossier. 3. Ne pas annuler les rendez-vous des patients. | Désactivation et fermeture des sessions : console Keycloak (administrateur). Le service `identite` relit la fiche à chaque accès, mais une **suspension** (`POST /professionnels/:id/suspension`) n'a pas de motif « compte compromis » (liste fermée : signalement de l'Ordre, plainte confirmée, incident qualité confirmé). Durée de vie restante des jetons : `[À VÉRIFIER pendant l'exercice]`. |
| **03 h 40** | *Question* : que sait-on ? Quels dossiers ont été lus, et qu'est-ce qui a été lu ? | Lister à partir des traces : refus (rien de lu), bris de glace (3 dossiers lus), lectures autorisées des 6 patients du médecin depuis 02 h 47. | `AuditEvent` par dossier, avec qui, quand et pourquoi. Toutes les traces d'un même compte depuis une heure donnée : `GET /securite/traces-compte` (responsable sécurité, depuis la correction de l'écart E3) ; **pas encore d'écran**. |
| **08 h 30** | Un patient [FICTIF] appelle l'assistance : « Dans mon historique, un médecin que je ne connais pas a ouvert mon dossier cette nuit. » | L'assistance vérifie l'identité par la procédure de rappel, ne confirme rien au téléphone, transmet au responsable sécurité, note l'appel. | Écran « Aider un patient qui appelle » (rappel au numéro du dossier). Depuis la correction de l'écart E4 : le patient conteste l'accès lui-même depuis son historique (alerte `AccesConteste` au responsable sécurité), et la procédure « accès contesté par un patient » du plan d'incident guide l'assistance. |
| **09 h 00** | Le vrai Dr Fictif-Pro-07 [FICTIF] écrit : il ne peut plus se connecter et a des patients ce matin. | Rendez-vous du jour signalés à l'assistance, jamais annulés automatiquement ; réactiver le compte seulement après un nouveau mot de passe, une nouvelle double authentification et un entretien. | Section « Rendez-vous à reprendre » : elle ne liste que les professionnels **non vérifiés** ; un compte désactivé mais encore « vérifié » n'y apparaît pas `[À VÉRIFIER]`. |
| **10 h 00** | *Question* : faut-il notifier ? Qui, dans quel délai, avec quels mots ? | Avec le juriste : autorité de protection des données (CNPDCP ; autorité de l'UE sous 72 h si le RGPD s'applique) ; information des 3 patients dont le dossier a été lu ; brouillons préparés, envoyés par un humain. | Délais légaux gabonais `[À CONFIRMER]` (D-0003) ; pas de gabarit de SMS ni de lettre pour une violation de données. |
| **11 h 00** | *Clôture du jeu* : retour d'expérience. | Voir la section 6. | |

**Variante si le temps le permet.** Même scénario, mais l'attaquant ne lit que les 6 patients du médecin, par des accès autorisés. Question : qui s'en rend compte, et quand ?
Avant la correction de l'écart E1, la réponse était : **personne**, avant qu'un patient ne regarde son historique. Depuis cette correction, la règle `LecturesDossiersEnSerie` appelle le responsable sécurité au-delà de 30 dossiers différents lus en une heure. Six dossiers ne la déclenchent pas : en séance, discuter du seuil et de ce qui reste invisible.

## 5. Grille d'évaluation

| Mesure | Cible | Relevé |
|---|---|---|
| Délai entre l'alerte critique et sa prise en compte par un humain | ≤ 15 min | |
| Délai entre la prise en compte et l'accès coupé | ≤ 30 min | |
| Gravité correctement qualifiée (critique, sécurité des données) | Oui | |
| Porteur de projet informé | Oui, dès la qualification | |
| Liste des dossiers lus établie à partir des traces | ≤ 2 h, sans erreur | |
| Aucun rendez-vous annulé automatiquement ; patients du médecin prévenus | Oui | |
| Décision de notification prise avec le juriste et tracée | Oui | |
| Chronologie tenue en temps réel | Oui | |
| Aucune preuve modifiée ou effacée | Oui | |

## 6. Retour d'expérience (30 minutes)

1. Ce qui a marché, ce qui a manqué, ce qui a surpris.
2. Pour chaque écart : une **action**, un **rôle responsable**, une **échéance** ; une fiche problématique si une décision du porteur de projet est nécessaire.
3. Mises à jour :
   - [plan d'incident](plan-incident.md) ;
   - [modèle de menaces](modele-menaces.md) ;
   - [AIPD n°2](aipd-teleconsultation.md) ;
   - leçons apprises de `memory.md` ;
   - registre des risques.
4. Date du prochain exercice. Le skill `reponse-incident` prévoit un exercice par trimestre.

## 7. Écarts relevés en préparant l'exercice (à confirmer en séance)

| N° | Écart | Proposition (à décider) |
|---|---|---|
| E1 | **Aucune alerte sur un volume anormal d'accès autorisés** d'un même professionnel : seuls les refus et les bris de glace sont surveillés. | **Corrigé** : événement `acces-professionnel` (service `identite`) et règle `LecturesDossiersEnSerie` (plus de 30 dossiers différents en 1 h, vers le responsable sécurité ; seuil provisoire à confirmer en séance) |
| E2 | Pas de motif de suspension « compte compromis », et la suspension remet la fiche en vérification. La bonne coupure passe par Keycloak, mais la procédure n'est pas écrite. | **Traité** : procédure « couper un compte compromis » dans le [plan d'incident](plan-incident.md) (Keycloak : désactiver, fermer les sessions, retirer la double authentification ; jeton encore valable jusqu'à 5 min ; pas de suspension pour un compte volé). Retrait d'une téléconsultation en cours : `POST /securite/retrait-salles` (rôle `responsable-securite`) |
| E3 | Pas d'écran ni de requête prête pour « toutes les traces d'un compte depuis H ». | **Traité** : `GET /securite/traces-compte` du service `identite` (rôle `responsable-securite`, 30 jours au plus, dossiers obtenus sans doublon), dans le [plan d'incident](plan-incident.md). Un écran reste à faire si l'exercice le confirme |
| E4 | Pas de procédure pour un patient qui **conteste un accès** vu dans son historique. | **Traité côté serveur** : `POST /patients/:id/acces/:traceId/contestation` (le patient lui-même, sans texte libre, trace dans le dossier), alerte `AccesConteste` et `GET /securite/contestations` (responsable sécurité) ; procédure « accès contesté par un patient » dans le [plan d'incident](plan-incident.md). Bouton « Je ne reconnais pas cet accès » de l'application patient : PR suivante |
| E5 | Un professionnel désactivé dans Keycloak mais toujours « vérifié » n'apparaît pas dans « Rendez-vous à reprendre ». | Vérifier en séance ; si besoin, suspension temporaire ou liste manuelle |
| E6 | Aucun gabarit d'information des patients en cas de violation de données. | Brouillons de SMS et de lettre, à valider par le juriste |
| E7 | Titulaires des rôles non désignés ; aucune astreinte réelle. | Questions n°2 et n°10 de `memory.md` |

## Sources

- [Plan d'incident](plan-incident.md) ; ADR-0006, 0009, 0016, 0026 ; règles d'alerte `platform/packages/supervision/src/regles.ts`.
- NIST SP 800-61 Rev. 3 (2025), https://doi.org/10.6028/NIST.SP.800-61r3 ; CISA, *Tabletop Exercise Packages* (CTEP), https://www.cisa.gov/resources-tools/services/cisa-tabletop-exercise-packages ; RGPD, articles 33 et 34 ; CEPD, lignes directrices 9/2022.
