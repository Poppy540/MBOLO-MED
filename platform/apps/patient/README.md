# Application patient (prototype)

PWA légère pour **réseaux lents et téléphones d'entrée de gamme** : Preact + Vite, en français, gros boutons, pictogrammes, peu de texte. Briques communes (connexion, dates, visio) dans `@mbolo/client-web`.

## Parcours

1. **Connexion** : Keycloak, client public `mbolo-app-patient`, flux « authorization code » avec **PKCE S256**, vérification de l'état (anti-CSRF). Le jeton reste **en mémoire**, jamais dans `localStorage`.
2. **Mes rendez-vous** : liste des rendez-vous prévus, boutons « Rejoindre », « Déplacer » et « Annuler ». « Déplacer » propose les créneaux libres du même médecin (`POST /rendez-vous/:id/report`) : le rendez-vous change d'horaire sans nouveau paiement, l'ancien créneau redevient libre et le médecin est prévenu par le service. Il n'apparaît pas tant que le rendez-vous attend son paiement.
3. **Prendre rendez-vous** :
   - **sans lien**, l'**annuaire** liste les médecins (nom, spécialité, prochain créneau libre) ; dès qu'il compte plusieurs spécialités, une liste « Spécialité » filtre les médecins sur le téléphone, sans appel de plus ;
   - avec le lien d'un point de consultation (`/?praticien=<id>`), les créneaux de ce médecin s'affichent directement ;
   - le patient choisit un créneau, puis confirme.
4. **Téléconsultation** : LiveKit, chargé **seulement à ce moment** (141 Ko compressés) :
   - le micro et la caméra sont demandés **avant** la connexion (message clair en cas de refus) ;
   - vidéo en basse définition (216p), flux adaptatif ;
   - **repli audio automatique** si la qualité reste mauvaise 5 secondes ou si la connexion est perdue ; bouton « Audio seulement » / « Réactiver la vidéo ».
   - **économie de données** : si le téléphone est en mode « économie de données » (ou sur un réseau 2G), la consultation commence en audio seulement, sans allumer la caméra ni recevoir de vidéo (« Économie de données : audio seulement. Vous pouvez réactiver la vidéo. ») ; la vidéo reste activable d'un geste.
   - **consommation mesurée** (e2e `faible-debit/reseau-lent.feature`, envoi et réception, caméra simulée) : environ 1,9 Mo par minute en vidéo (plafond 2,5 Mo), environ 300 Ko par minute en audio seulement (plafond 350 Ko), soit environ 4,5 Mo pour 15 minutes en audio seulement.

5. **Payer la consultation** (ADR-0017), quand le paiement est ouvert pour le patient (flag `paiement.mobile-money`) ; écran chargé **seulement à la demande** :
   - après « Réserver », le créneau est retenu : le montant (au format du pays) et le temps restant s'affichent ;
   - le patient choisit l'opérateur (liste du pays) et saisit le numéro qui paie, le sien ou celui d'un proche ; le numéro n'est **jamais gardé** (champ vidé dès l'envoi) ;
   - « Validez le paiement sur le téléphone avec votre code secret… », puis l’application vérifie le paiement (toutes les 3 secondes pendant la première minute, puis toutes les 10 secondes ; une seule requête à la fois ; rien en arrière-plan, vérification dès le retour dans l’application) : « Paiement reçu. Votre rendez-vous est confirmé. », ou « Le paiement n'a pas abouti. Vous pouvez réessayer. », ou « Le délai de paiement est dépassé. Le créneau est libéré. » ;
   - « Plus tard » : le rendez-vous reste dans la liste, « En attente de paiement », avec un bouton « Payer ». Il n'est gardé hors ligne qu'une fois confirmé.

6. **Vérifier mon identité** (ADR-0014, ADR-0015), tant que l'identité est « à vérifier » ou « refusée » ; écran chargé **seulement à la demande** (2,3 Ko compressés) :
   - le patient lit la **charte** et choisit « J'accepte » ou « Je refuse » : consentement `C-IDENTITE` enregistré par le service `identite`, avec la version du texte ;
   - puis il envoie **deux photos** : son document (pièce d'identité avec son numéro d'assurance maladie, ou acte de naissance) et son visage ;
   - chaque photo est **réduite (1 600 px au plus) et recompressée en JPEG sur le téléphone**, ce qui retire aussi ses métadonnées (lieu, appareil) ; elle n'est jamais gardée dans le navigateur ;
   - derrière le flag `identite.photos`, désactivé tant que la charte n'est pas validée. Le texte affiché reprend le **brouillon** v0.1 et sera remplacé mot pour mot par le texte validé.

7. **Mes comptes-rendus et ordonnances**, depuis « Mes rendez-vous » ; écran chargé **seulement à la demande** (1,3 Ko compressés), service `consultation` (`GET /mes-documents`) :
   - les ordonnances (médicament, dose, fréquence dite en phrase, durée ; « Valable jusqu'au … » ou « Annulée par le médecin : ne pas l'utiliser. »), puis les comptes-rendus, les plus récents d'abord ;
   - le texte est **exactement celui du professionnel**, jamais résumé ni reformulé par une IA ; rappel « Ne changez pas votre traitement sans l'avis d'un médecin. En cas d'urgence, appelez les secours. » ;
   - chaque lecture est **tracée** dans le dossier (visible dans l'historique des accès du patient) ;
   - **rien n'est gardé sur le téléphone**, souvent partagé en famille : sans réseau, l'écran le dit simplement.

8. **Proche désigné** (compte `proche`, flag `documents.proche`) : à la connexion, l'application ouvre directement « Ordonnances et consignes de votre proche » :
   - ordonnances et consignes du médecin (« Ce qu'il faut faire ») seulement, jamais le motif, les observations ni la conclusion (filtré par le service) ;
   - message « Votre proche partage avec vous ses ordonnances et les consignes du médecin. Il peut retirer ce partage à tout moment. » ;
   - même écran que le patient (chargé à la demande, rien gardé sur le téléphone).

9. **Mes partages et accès** (ADR-0009, principe n°3), depuis « Mes rendez-vous » ; écran chargé **seulement à la demande** (2,1 Ko compressés) :
   - « Qui peut lire mon dossier » : partages en cours (médecin nommé, ou « Votre proche »), chacun avec **« Retirer ce partage »** (révocation immédiate, conservée dans le dossier) ;
   - « Partager mon dossier avec … » pour le médecin de chaque rendez-vous : le patient lit le texte (qui nomme le médecin et rappelle que l'accord se retire à tout moment), puis **« J'accepte »** ou **« Non, pas maintenant »** ; jamais pré-coché ni groupé (consentement `C-PARTAGE-PRO`, texte **brouillon** `c-partage-pro-v0.1-brouillon`, à valider par le juriste) ;
   - « Qui a demandé à lire mon dossier » : les 20 dernières demandes, en mots simples (vous-même, un professionnel de santé, votre proche…), accordées ou refusées, avec les accès en urgence et leur justification ;
   - pas de flag : le consentement et la transparence ne sont jamais derrière un flag ;
   - **Mes proches** (ADR-0019, section visible seulement si le flag `consentement.proche` est ouvert pour le patient) : la liste des proches (prénom, lien, « Invitation envoyée, valable jusqu'au … » ou « A créé son compte »), **« Retirer ce proche »** (le proche perd l'accès, la place est libérée), et **« Inviter un proche »** (3 au plus) : prénom, lien (liste fermée), numéro **au format international** (vérifié avant l'envoi), texte de partage `C-PROCHE` qui nomme le proche et dit ce qu'il verra (**brouillon** `c-proche-v0.1-brouillon`, à valider par le juriste), puis « J'accepte et j'envoie le code ». Le code part par SMS et s'affiche aussi, **en secours**. Le numéro est effacé du formulaire et n'est gardé nulle part ; un partage avec un proche porte son prénom.
10. **Mes reçus** (ADR-0020, flag `facturation.recus`), depuis « Mes rendez-vous » ; écran chargé **seulement à la demande** : un reçu par paiement reçu et un avoir par remboursement, chacun comme une fiche à montrer (montant, date, opérateur sans le numéro, numéro du reçu, reçu annulé pour un avoir, émetteur) ; « Reçu sans valeur fiscale » tant que les mentions ne sont pas validées ; rien n'est gardé sur le téléphone ; fonction fermée pour le patient : le message du service s'affiche.

11. **Confirmer par SMS** (ADR-0022) : avant de **payer** (avant la saisie du numéro qui paie), ou quand le patient choisit de **partager son dossier** ou d'**inviter un proche**, un écran explique qu'un code part au numéro du dossier. « Recevoir le code » ouvre la page de Keycloak (`acr_values=2`, même session : le code seul, pas le mot de passe), puis l'application rouvre l'écran de l'action. Pendant l'aller-retour, seul l'écran à rouvrir est gardé (`sessionStorage`, nom et identifiant du rendez-vous), jamais ce qui a été saisi. Le code vaut 15 minutes ; après, un refus `niveau-insuffisant` d'un service ramène au même écran. Retirer un partage ou un proche ne demande jamais de code.

12. **Changer mon numéro** (ADR-0023), depuis « Mes rendez-vous », ou depuis l'écran « Votre compte est créé » tant que l'identité n'est pas vérifiée (l'équipe appelle au numéro du dossier) :
    - un écran explique qu'il faut les deux téléphones : un code à l'ancien numéro, le nouveau numéro, puis un code au nouveau numéro ; l'ancien numéro est prévenu ;
    - « Recevoir le code » ouvre l'action Keycloak `mbolo-changer-telephone` (`kc_action`) : **le numéro et les codes ne passent jamais par l'application** ;
    - au retour, l'application lit `kc_action_status` et affiche « Votre numéro est changé… », « Votre numéro n'a pas changé. » ou « …n'a pas pu être changé. Réessayez plus tard. » ;
    - pas de flag : c'est une fonction de sécurité ;
    - **« J'ai perdu mon téléphone »** (même écran) : action Keycloak `mbolo-telephone-perdu` (nouveau numéro et son code seulement). Au retour réussi, l'application ouvre « Vos deux nouvelles photos » (même écran que la vérification d'identité, chargé à la demande, charte déjà acceptée) ; une personne de l'équipe vérifie avant de changer le numéro, et l'ancien numéro est prévenu. « Envoyer mes photos (demande déjà faite) » rouvre cet écran plus tard.
13. **Protéger mon compte** (ADR-0024), depuis « Mes rendez-vous » : en option, une application d'authentification gratuite (Google Authenticator, Microsoft Authenticator ou FreeOTP) remplace le code SMS des actions sensibles.
    - « Activer une application » ouvre l'action Keycloak `mbolo-activer-application` avec `acr_values=2` : code SMS d'abord (sauf s'il a été donné il y a moins de 15 minutes), puis code à scanner et premier code de l'application ;
    - « Retirer mon application » ouvre `mbolo-retirer-application` : un code de l'application, puis retour au SMS ;
    - l'application ne sait pas si une application est active : Keycloak le dit lui-même (« déjà active », « aucune application ») ; au retour, message selon `kc_action_status` ;
    - téléphone ou application perdus : l'équipe d'assistance (code de récupération, puis 24 heures sans code SMS) ;
    - seul un mot fixe est gardé pendant l'aller-retour, jamais le nom de l'action ; pas de flag : c'est une fonction de sécurité.

Les erreurs sont affichées en phrases simples, sans jargon.

**Urgence** (principe n°2) : un bandeau « 🚑 En cas d'urgence, appelez les secours » est affiché **sur tous les écrans**, avant la connexion et sans réseau. Il n'y a rien à ouvrir ni à charger. Les numéros du pays (`VITE_NUMEROS_SECOURS`) deviennent des liens d'appel direct. Aucun numéro n'est écrit dans le code : sans numéro configuré, seul le message s'affiche. Les numéros de chaque pays sont à valider par le comité médical avant l'ouverture.

## Hors ligne et économie de données

- **Service worker** (`public/sw.js`, identique dans les deux applications, source dans `@mbolo/client-web`) :
  - les fichiers de l'application (noms uniques par version) sont servis **depuis le téléphone** après la première visite : moins de données consommées ;
  - la page est demandée au réseau d'abord, puis servie depuis le téléphone s'il n'y en a pas ;
  - **l'API et la connexion (Keycloak) ne sont jamais mises en cache** (données personnelles, jetons).
- **Réseau absent ou saturé** : chaque appel est abandonné après 20 s sans réponse, avec un message clair (« Pas de réseau », « Le réseau est trop lent ») au lieu d'une attente sans fin ou d'un « service indisponible » trompeur ; après un envoi resté sans réponse (réservation, annulation…), le message invite à vérifier avant de réessayer, car l'action a pu être faite. La liste des rendez-vous passe alors en vue sans réseau. Même règle sur tous les écrans (paiement, partages, proches, documents, reçus) ; l'envoi d'une photo d'identité (jusqu'à 2 Mo) a 2 min.
- **Dernière liste de rendez-vous connue** : gardée sur le téléphone réduite à l'identifiant, l'horaire et la durée (ni professionnel, ni patient, ni motif), affichée sans réseau avec sa date de mise à jour, **effacée à la déconnexion**.
- Service worker actif seulement dans l'application construite (`pnpm build`), pas en développement.

## Déploiement dans un autre pays

Le Gabon est le premier pays ; rien de ce qui dépend du pays n'est codé en dur. Variables de construction :

| Variable               | Défaut                                | Rôle                                                                                                                                   |
| ---------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_KEYCLOAK_ISSUER` | `http://127.0.0.1:8081/realms/mbolo`  | Émetteur Keycloak                                                                                                                      |
| `VITE_WEBRTC_URL` | `ws://127.0.0.1:7880` | Serveur de visio (LiveKit), seule adresse de visio autorisée par la politique de sécurité du contenu |
| `VITE_KEYCLOAK_CLIENT` | `mbolo-app-patient`                   | Client public                                                                                                                          |
| `VITE_FUSEAU`          | `Africa/Libreville`                   | Fuseau horaire affiché (IANA)                                                                                                          |
| `VITE_LANGUE`          | `fr-FR`                               | Formats des dates et des montants, pluriels du français (BCP 47)                                                                       |
| `VITE_LANGUES` | `fr:Français` | Langues proposées au patient (« code:Nom », nom écrit dans la langue), seulement celles dont la traduction est validée ; une seule : aucun choix affiché |
| `VITE_NOM_ASSURANCE`   | `CNAMGS`                              | Nom de l'assurance maladie nationale, affiché dans la vérification d'identité                                                          |
| `VITE_OPERATEURS`      | `airtel:Airtel Money,moov:Moov Money` | Opérateurs de mobile money du pays (« code:Nom affiché ») ; les codes doivent être ceux du service de paiement (`PAIEMENT_OPERATEURS`) |
| `VITE_INDICATIF`       | `241`                                 | Indicatif téléphonique du pays, montré dans le champ du numéro                                                                         |
| `VITE_NUMEROS_SECOURS` | aucun | Numéros des secours du pays (« Nom:numéro », séparés par des virgules), validés par le comité médical ; une entrée mal formée est ignorée |

Les API sont servies sous `/api/<service>` (même origine). L'application construite porte une politique de sécurité du contenu (balise `<meta>`, revue ASVS C6) : scripts de la même origine seulement, connexions limitées à la même origine, à Keycloak et à la visio ; les en-têtes `frame-ancestors`, HSTS et `Referrer-Policy` sont à poser par l'hébergement. En local, `vite preview` relaie vers `TELECONSULTATION_URL` (défaut `http://127.0.0.1:3003`), `IDENTITE_URL` (`3001`), `DOCUMENTS_URL` (`3007`) et `PAIEMENT_URL` (`3008`).

## Textes et langues (ADR-0025)

Les textes affichés sont rangés dans un catalogue par langue, avec la fonction `t(cle, valeurs)` de `@mbolo/client-web` (sans bibliothèque, pluriels par `Intl.PluralRules`). `src/textes-fr.ts` est la référence : ses clés sont typées, une clé inconnue ne compile pas, et un test vérifie que chaque clé est encore utilisée par un écran. Chaque écran chargé à la demande a son propre catalogue (`textes-fr-<écran>.ts`), chargé avec lui : l'ouverture ne s'alourdit pas. Tous les écrans sont passés au catalogue : ceux de `app.tsx`, « Mes reçus », « Mes comptes-rendus et ordonnances » (les textes écrits par le médecin restent affichés tels quels), le paiement, les partages, les proches et la vérification d'identité (dont la charte `C-IDENTITE`, encore brouillon). Les textes de consentement et d'urgence sont des phrases entières, jamais assemblées par morceaux, pour être traduits et validés d'un bloc. Les tests vérifient que chaque clé est utilisée et qu'une clé n'appartient qu'à un seul catalogue. **Choix de la langue** : si le pays en propose plusieurs (`VITE_LANGUES`), le premier écran montre un bouton par langue, avant la connexion, chacun écrit dans sa langue et marqué comme tel (`lang`, WCAG 3.1.2). Le choix change aussitôt les textes et la langue de la page (WCAG 3.1.1) ; il est gardé sur le téléphone et repris à la prochaine ouverture. Une langue n'est proposée que si son catalogue existe ; son fichier (`textes-<code>.ts`) n'est chargé que si elle est choisie. Les écrans chargés à la demande restent en français tant qu'aucune langue réelle n'est validée.

Aucune vraie langue n'est encore proposée : chaque langue ajoutée doit être traduite par des humains et validée. Pour tester le parcours, un catalogue de **démonstration** `fr-x-fictif` (« [FICTIF] Démo », `textes-fictif.ts`) reprend quelques textes du français marqués `[FICTIF]` ; il n'est proposé que si `VITE_LANGUES` le cite (job e2e de la CI), jamais en production.

## Budget de poids

`pnpm build` échoue si le poids compressé (gzip) dépasse un plafond (script commun `packages/client-web/scripts/budget.mjs`) : **30 Ko à l'ouverture** (aujourd'hui 16,5 Ko), **8 Ko par écran chargé à la demande** (le plus lourd : « Mes partages et accès », 4,4 Ko avec son catalogue), **160 Ko pour la bibliothèque vidéo**, chargée seulement pour une consultation (140 Ko).

Sur un réseau « 3G lente » simulé, l'écran d'accueil s'affiche en moins de 8 secondes avec moins de 30 Ko transférés (e2e `faible-debit/reseau-lent.feature`).

## Lancer

```bash
pnpm --filter @mbolo/app-patient build
pnpm --filter @mbolo/app-patient preview   # http://localhost:5180 (les ports 5173 et 5174 servent aux tests e2e)
```

## Tests

- **Unitaires** : défi PKCE (vecteur de la RFC 7636), état et code à usage unique, messages d'erreur, dates selon le pays, décision de repli audio.
- **E2E** (`features-gherkin/teleconsultation/application-patient.feature`), vrai navigateur :
  - connexion par le formulaire Keycloak, réservation d'un créneau puis annulation ;
  - déplacement d'un rendez-vous vers un autre créneau du même médecin (l'ancien créneau redevient libre) ;
  - filtre de l'annuaire par spécialité (spécialités fictives des médecins de test) ;
  - rejoindre la consultation, voir la vidéo du professionnel, passer en audio seulement ;
  - sans réseau, l'application rouvre et affiche les rendez-vous connus (rien d'autre n'est gardé), avec le bandeau d'urgence.
- **E2E** (`features-gherkin/identite/verification-identite.feature`) : charte acceptée, puis envoi des deux photos (images générées, jamais de vraie personne).

## Reste à faire

- Textes des écrans chargés à la demande dans le catalogue ; choix de la langue par le patient ; langues locales et messages vocaux (ADR-0025).
- Recherche par ville quand l'annuaire grandira.
- Validation des écrans avec le pilote conception (skill `ux-contexte-gabonais`) et test terrain sur téléphone réel.
