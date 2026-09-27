# Application patient (prototype)

PWA légère pour **réseaux lents et téléphones d'entrée de gamme** : Preact + Vite, en français, gros boutons, pictogrammes, peu de texte. Briques communes (connexion, dates, visio) dans `@mbolo/client-web`.

## Parcours

1. **Connexion** : Keycloak, client public `mbolo-app-patient`, flux « authorization code » avec **PKCE S256**, vérification de l'état (anti-CSRF). Le jeton reste **en mémoire**, jamais dans `localStorage`.
2. **Mes rendez-vous** : liste des rendez-vous prévus, boutons « Rejoindre » et « Annuler ».
3. **Prendre rendez-vous** : créneaux libres du professionnel indiqué par le lien reçu (`/?praticien=<id>`, par exemple donné par le point de consultation), puis confirmation. L'annuaire des professionnels viendra plus tard.
4. **Téléconsultation** : LiveKit, chargé **seulement à ce moment** (141 Ko compressés) :
   - le micro et la caméra sont demandés **avant** la connexion (message clair en cas de refus) ;
   - vidéo en basse définition (216p), flux adaptatif ;
   - **repli audio automatique** si la qualité reste mauvaise 5 secondes ou si la connexion est perdue ; bouton « Audio seulement » / « Réactiver la vidéo ».

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

L'API de téléconsultation est servie sous `/api/teleconsultation` (même origine). En local, `vite preview` relaie vers `TELECONSULTATION_URL` (défaut `http://127.0.0.1:3003`).

## Budget de poids

`pnpm build` échoue si ce qui est téléchargé **à l'ouverture** dépasse **30 Ko** compressés (`scripts/budget.mjs`). Aujourd'hui : **10,3 Ko**.

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

## Reste à faire

- Traduction en langues locales, messages vocaux.
- Annuaire des professionnels ; report depuis l'application.
- Validation des écrans avec le pilote conception (skill `ux-contexte-gabonais`) et test terrain sur téléphone réel.
