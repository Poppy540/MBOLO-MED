# ADR-0025 — Langues, pictogrammes et vocal dans les applications

- **Date :** 2026-10-03
- **Statut :** proposée (choix du porteur de projet du 2026-10-03 d'ouvrir ce chantier ; réponses attendues aux questions de la fin)
- **Décideurs :** porteur de projet ; comité médical et juriste pour la validation des textes traduits

## Contexte

La décision D-0001 prévoit une plateforme « en français puis en langues locales », avec « vocal et pictogrammes » pour les personnes qui lisent peu. Les vagues placent les **premières langues locales en vague 3** (fang, punu, myènè, nzébi…, `docs/deploiement/vagues.md`). La plateforme doit aussi pouvoir s'exporter : la langue, comme le reste de ce qui dépend du pays, est **paramétrable**, jamais codée en dur (décision du 2026-09-27).

Aujourd'hui :

- Les deux applications affichent environ **200 textes en français écrits directement dans le code**. Seuls les formats (dates, montants) suivent déjà la langue du pays (`VITE_LANGUE`, `Intl`).
- Les **pictogrammes sont des émojis** (environ 50 : 📹, 📞, 💳…). Leur dessin change d'un téléphone à l'autre, et certains Android anciens les affichent comme des carrés vides.
- Les pages de connexion Keycloak et les SMS sont en français seulement.
- Le budget de poids impose **30 Ko à l'ouverture** et **8 Ko par écran chargé à la demande** (PR n°123). Une bibliothèque d'internationalisation courante pèse à elle seule de 5 à 15 Ko.

Les professionnels viennent **du monde entier** (D-0001) : l'espace professionnel a aussi besoin d'au moins une langue en plus du français.

## Décision proposée

### 1. Textes rangés dans des catalogues, sans bibliothèque

- Chaque texte affiché reçoit une **clé** (`rendezVous.annuler`, `paiement.attente`…) et sa valeur dans un **catalogue par langue**. Le catalogue français est la référence.
- Une petite fonction maison `t(cle, valeurs)` (moins de 1 Ko) remplace les valeurs variables (`{date}`, `{montant}`) et gère les pluriels avec `Intl.PluralRules`, déjà présent dans le navigateur. **Aucune dépendance nouvelle.**
- Les clés sont **typées** (TypeScript) : une clé absente ou mal écrite fait échouer la compilation. Un test vérifie que chaque catalogue traduit contient exactement les clés du catalogue français.
- Le **français reste dans le paquet d'ouverture**. Chaque autre langue est un fichier **chargé à la demande**, soumis au budget de 8 Ko et mis en cache pour le hors-ligne.
- Une clé qui n'est pas encore traduite s'affiche **en français**, jamais vide. Une langue n'est proposée aux patients qu'une fois **complète et validée** (voir 4), derrière un flag `langue.<code>` désactivé par défaut (ADR-0003).

### 2. Choix de la langue

- Les langues proposées dépendent du **pays** (`VITE_LANGUES`, par exemple `fr` au Gabon en vague 1). Le choix est **paramétré, jamais codé en dur**.
- Le patient choisit sa langue **avant même de se connecter**, par un bouton visible sur le premier écran (le nom de chaque langue est écrit dans cette langue : « Français », « Fang »…).
- Le choix est gardé **sur le téléphone** (ce n'est pas une donnée de santé). Après la connexion, il est aussi enregistré dans l'attribut `locale` du compte Keycloak, qui sert alors pour les pages de connexion (catalogues `messages_<code>.properties` du thème `mbolo`) et, plus tard, pour la langue des SMS (`notifications`).
- La page porte l'attribut `lang` de la langue choisie (WCAG 3.1.1), pour que les lecteurs d'écran prononcent correctement.
- Les codes de langue suivent l'ISO 639 : `fr`, `en`, `fan` (fang), `puu` (punu), `mye` (myènè), `nzb` (nzébi). Le navigateur ne connaît pas toujours les règles de dates et de pluriels de ces langues : les formats retombent alors sur le français du pays.

### 3. Pictogrammes

- Les émojis sont remplacés par un **jeu de pictogrammes dessinés en SVG**, inclus dans le code (aucun fichier à télécharger, quelques centaines d'octets chacun), identiques sur tous les téléphones.
- Un pictogramme **accompagne toujours un texte visible**, il ne le remplace jamais : il est décoratif pour les lecteurs d'écran (`aria-hidden`), et le texte reste la référence.
- Le jeu est d'abord limité aux **actions clés** : rendez-vous, appel vidéo, audio seulement, raccrocher, payer, ordonnance, urgence, partage, proche, réseau absent.
- Les pictogrammes sont **testés avec des patients** pendant le test terrain (`docs/deploiement/test-terrain-faible-debit.md`) avant d'être figés : un dessin compris à Libreville peut ne pas l'être en province.

### 4. Traductions : qui traduit, qui valide

- Les textes sont traduits par des **traducteurs humains** locuteurs natifs. Une traduction automatique ou proposée par une IA peut servir de **brouillon**, jamais de version publiée.
- Les textes **sensibles** sont validés dans chaque langue avant publication : consentements et chartes par le **juriste**, conseils et messages d'urgence par le **comité médical**. Les autres textes sont relus par un second locuteur.
- Chaque catalogue porte sa **version** et la liste de ses relecteurs. Un consentement accepté dans une langue garde la trace de cette langue (`policyRule` du `Consent`).

### 5. Vocal

- Beaucoup de personnes parlent le fang, le punu, le myènè ou le nzébi sans les lire. Pour elles, l'écrit traduit aide peu : la plateforme prévoit des **messages vocaux enregistrés par des locuteurs** (pas de voix de synthèse, qui n'existe pas en qualité suffisante pour ces langues).
- Un bouton « Écouter » lit le message clé de l'écran. Les enregistrements sont courts, compressés (Opus, environ 2 Ko par seconde), chargés **seulement à la demande** et gardés pour le hors-ligne.
- Le vocal vient **après** les catalogues écrits et les pictogrammes. Son ampleur est une décision du porteur de projet (question 4).

### 6. Ce qui ne change pas

- Les consultations ne sont pas traduites par la plateforme : un patient qui ne parle pas la langue du médecin est orienté vers un **interprète humain** (skill `coordination-interpretes`), jamais vers une traduction automatique de l'échange médical.
- Les gabarits de SMS restent **fermés** (ADR-0012) : une langue en plus signifie un gabarit validé en plus, pas un texte libre.

## Mise en œuvre proposée (petites PR)

1. **Mécanisme et catalogue français de l'application patient** : `t()`, clés typées, test de complétude, budget vérifié. Les textes sont extraits par lots, écran par écran, sans rien changer à l'affichage (les e2e existants le prouvent).
2. **Choix de la langue** : liste par pays, bouton avant connexion, `lang` de la page, catalogue de démonstration marqué `[FICTIF]` pour tester le parcours sans attendre les traducteurs. *Fait (PR n°141).* La liste `VITE_LANGUES` sert de barrière au déploiement ; le flag `langue.<code>` (ouverture par cohorte) arrivera avec la première vraie langue.
3. **Pictogrammes SVG** à la place des émojis. *Fait pour les actions clés de l'application patient et de la consultation (PR n°142) : premier jeu simple (`Picto` de `@mbolo/client-web`), à tester sur le terrain ou à faire redessiner (question 5) ; les autres émojis suivent avec l'espace professionnel (étape 4).*
4. **Espace professionnel** : même mécanisme, avec l'anglais si le porteur de projet le retient (question 2).
5. **Pages Keycloak et SMS** dans la langue du compte : attribut `locale` du compte Keycloak (transmis par `ui_locales` à la connexion), catalogues `messages_<code>.properties` du thème `mbolo`, gabarits de SMS par langue.
6. **Vocal**, selon la réponse à la question 4.

## Conséquences

- **Positives :** une langue s'ajoute sans toucher au code, par un catalogue validé et un flag ; le poids à l'ouverture ne bouge presque pas ; les pictogrammes s'affichent partout de la même façon.
- **Négatives :** chaque nouveau texte doit passer par une clé (contrôlé par la compilation) ; chaque langue coûte une traduction et une validation humaines, à chaque nouvelle version des textes sensibles.
- **Risques :** une traduction approximative d'un consentement ou d'un message d'urgence ; c'est pourquoi aucune langue n'est proposée avant sa validation complète.

## Questions au porteur de projet

1. **Quelles langues locales en premier**, et dans quel ordre (fang, punu, myènè, nzébi…) ? Pour quelles villes ou provinces ?
2. **L'anglais pour l'espace professionnel** (médecins étrangers) dès la vague 1 ? Et pour l'application patient (diaspora) ?
3. **Qui traduit** (traducteurs, associations, universités) et avec quel budget ? Qui fait la seconde relecture ?
4. **Le vocal** : dans quelles langues, pour quels écrans d'abord (urgence, rendez-vous, paiement) ? Qui enregistre ?
5. **Les pictogrammes** : faut-il les faire dessiner par un graphiste et les tester avec des patients avant de les figer, ou commencer par un premier jeu simple, testé ensuite sur le terrain ?

## Sources

- Décision D-0001 (`control-room/decisions/0001-decisions-initiales.md`) et vagues (`docs/deploiement/vagues.md`).
- Budget de poids : `packages/client-web/scripts/budget.mjs` (PR n°123).
- W3C, *WCAG 2.2*, critères 3.1.1 « Langue de la page » et 3.1.2 « Langue d'un passage » — https://www.w3.org/TR/WCAG22/
- Unicode CLDR, règles de pluriel — https://cldr.unicode.org/
- ISO 639-3, codes des langues (fan, puu, mye, nzb) — https://iso639-3.sil.org/
- Keycloak, *Server Administration Guide*, internationalisation des thèmes — https://www.keycloak.org/docs/latest/server_admin/
