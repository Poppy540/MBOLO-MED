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

| Variable | Défaut | Rôle |
|---|---|---|
| `VITE_KEYCLOAK_ISSUER` | `http://127.0.0.1:8081/realms/mbolo` | Émetteur Keycloak |
| `VITE_KEYCLOAK_CLIENT` | `mbolo-app-patient` | Client public |
| `VITE_FUSEAU` | `Africa/Libreville` | Fuseau horaire affiché (IANA) |
| `VITE_LANGUE` | `fr-FR` | Langue et formats (BCP 47) |
| `VITE_NOM_ASSURANCE` | `CNAMGS` | Nom de l'assurance maladie nationale, affiché dans la vérification d'identité |
| `VITE_OPERATEURS` | `airtel:Airtel Money,moov:Moov Money` | Opérateurs de mobile money du pays (« code:Nom affiché ») ; les codes doivent être ceux du service de paiement (`PAIEMENT_OPERATEURS`) |
| `VITE_INDICATIF` | `241` | Indicatif téléphonique du pays, montré dans le champ du numéro |

Les API sont servies sous `/api/<service>` (même origine). En local, `vite preview` relaie vers `TELECONSULTATION_URL` (défaut `http://127.0.0.1:3003`), `IDENTITE_URL` (`3001`), `DOCUMENTS_URL` (`3007`) et `PAIEMENT_URL` (`3008`).

## Budget de poids

`pnpm build` échoue si ce qui est téléchargé **à l'ouverture** dépasse **30 Ko** compressés (`scripts/budget.mjs`). Aujourd'hui : **11,5 Ko**.

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
