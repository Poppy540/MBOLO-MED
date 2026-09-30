# Application patient (prototype)

PWA légère pour **réseaux lents et téléphones d'entrée de gamme** : Preact + Vite, en français, gros boutons, pictogrammes, peu de texte. Briques communes (connexion, dates, visio) dans `@mbolo/client-web`.

## Parcours

1. **Connexion** : Keycloak, client public `mbolo-app-patient`, flux « authorization code » avec **PKCE S256**, vérification de l'état (anti-CSRF). Le jeton reste **en mémoire**, jamais dans `localStorage`.
2. **Mes rendez-vous** : liste des rendez-vous prévus, boutons « Rejoindre » et « Annuler ».
3. **Prendre rendez-vous** :
   - **sans lien**, l'**annuaire** liste les médecins (nom, spécialité, prochain créneau libre) ;
   - avec le lien d'un point de consultation (`/?praticien=<id>`), les créneaux de ce médecin s'affichent directement ;
   - le patient choisit un créneau, puis confirme.
4. **Téléconsultation** : LiveKit, chargé **seulement à ce moment** (141 Ko compressés) :
   - le micro et la caméra sont demandés **avant** la connexion (message clair en cas de refus) ;
   - vidéo en basse définition (216p), flux adaptatif ;
   - **repli audio automatique** si la qualité reste mauvaise 5 secondes ou si la connexion est perdue ; bouton « Audio seulement » / « Réactiver la vidéo ».

5. **Payer la consultation** (ADR-0017), quand le paiement est ouvert pour le patient (flag `paiement.mobile-money`) ; écran chargé **seulement à la demande** :
   - après « Réserver », le créneau est retenu : le montant (au format du pays) et le temps restant s'affichent ;
   - le patient choisit l'opérateur (liste du pays) et saisit le numéro qui paie, le sien ou celui d'un proche ; le numéro n'est **jamais gardé** (champ vidé dès l'envoi) ;
   - « Validez le paiement sur le téléphone avec votre code secret… », puis l'application vérifie toutes les 3 secondes : « Paiement reçu. Votre rendez-vous est confirmé. », ou « Le paiement n'a pas abouti. Vous pouvez réessayer. », ou « Le délai de paiement est dépassé. Le créneau est libéré. » ;
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

Les erreurs sont affichées en phrases simples, sans jargon.

## Hors ligne et économie de données

- **Service worker** (`public/sw.js`, identique dans les deux applications, source dans `@mbolo/client-web`) :
  - les fichiers de l'application (noms uniques par version) sont servis **depuis le téléphone** après la première visite : moins de données consommées ;
  - la page est demandée au réseau d'abord, puis servie depuis le téléphone s'il n'y en a pas ;
  - **l'API et la connexion (Keycloak) ne sont jamais mises en cache** (données personnelles, jetons).
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
| `VITE_LANGUE`          | `fr-FR`                               | Langue et formats (BCP 47)                                                                                                             |
| `VITE_NOM_ASSURANCE`   | `CNAMGS`                              | Nom de l'assurance maladie nationale, affiché dans la vérification d'identité                                                          |
| `VITE_OPERATEURS`      | `airtel:Airtel Money,moov:Moov Money` | Opérateurs de mobile money du pays (« code:Nom affiché ») ; les codes doivent être ceux du service de paiement (`PAIEMENT_OPERATEURS`) |
| `VITE_INDICATIF`       | `241`                                 | Indicatif téléphonique du pays, montré dans le champ du numéro                                                                         |

Les API sont servies sous `/api/<service>` (même origine). L'application construite porte une politique de sécurité du contenu (balise `<meta>`, revue ASVS C6) : scripts de la même origine seulement, connexions limitées à la même origine, à Keycloak et à la visio ; les en-têtes `frame-ancestors`, HSTS et `Referrer-Policy` sont à poser par l'hébergement. En local, `vite preview` relaie vers `TELECONSULTATION_URL` (défaut `http://127.0.0.1:3003`), `IDENTITE_URL` (`3001`), `DOCUMENTS_URL` (`3007`) et `PAIEMENT_URL` (`3008`).

## Budget de poids

`pnpm build` échoue si ce qui est téléchargé **à l'ouverture** dépasse **30 Ko** compressés (`scripts/budget.mjs`). Aujourd'hui : **13,2 Ko**.

## Lancer

```bash
pnpm --filter @mbolo/app-patient build
pnpm --filter @mbolo/app-patient preview   # http://localhost:5180 (les ports 5173 et 5174 servent aux tests e2e)
```

## Tests

- **Unitaires** : défi PKCE (vecteur de la RFC 7636), état et code à usage unique, messages d'erreur, dates selon le pays, décision de repli audio.
- **E2E** (`features-gherkin/teleconsultation/application-patient.feature`), vrai navigateur :
  - connexion par le formulaire Keycloak, réservation d'un créneau puis annulation ;
  - rejoindre la consultation, voir la vidéo du professionnel, passer en audio seulement ;
  - sans réseau, l'application rouvre et affiche les rendez-vous connus (rien d'autre n'est gardé).
- **E2E** (`features-gherkin/identite/verification-identite.feature`) : charte acceptée, puis envoi des deux photos (images générées, jamais de vraie personne).

## Reste à faire

- Traduction en langues locales, messages vocaux.
- Report depuis l'application ; recherche par spécialité ou par ville quand l'annuaire grandira.
- Validation des écrans avec le pilote conception (skill `ux-contexte-gabonais`) et test terrain sur téléphone réel.
