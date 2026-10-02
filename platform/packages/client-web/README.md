# `@mbolo/client-web`

Briques communes des applications web (patient, professionnel) :

| Module | Rôle |
|---|---|
| `auth.ts` | Connexion OpenID Connect avec PKCE S256, état anti-CSRF, jeton en mémoire |
| `api.ts` | Appels avec le jeton, erreurs en phrases simples |
| `format.ts` | Dates au fuseau et dans la langue du pays ; saisie locale → instant (heure d'été comprise) |
| `repli.ts` | Décision de repli audio (qualité mauvaise 5 s ou connexion perdue) |
| `visio.ts` | LiveKit chargé à la demande, micro et caméra demandés avant la connexion, basse définition (384 × 216), voix au préréglage « parole » (24 kbit/s, silence non transmis, redondance contre les pertes) |
| `consultation.tsx` | Écran de téléconsultation commun |
| `focus.ts` | Au changement d'écran, focus sur le titre (`h2`) du nouvel écran, même chargé à la demande (WCAG 2.4.3), sans reprendre le focus si la personne l'a déplacé pendant le chargement : `useTitreAuFocus(ecran.nom)`, aussi pour les sous-écrans (`useTitreAuFocus(choisi ?? 'liste')`) |
| `hors-ligne.ts`, `hors-ligne-vue.tsx` | Dernière liste de rendez-vous connue (identifiant, horaire, durée seulement), vue sans réseau, enregistrement du service worker |
| `scripts/budget.mjs` | Budget de poids des deux applications, après `vite build` (gzip) : 30 Ko à l'ouverture, 8 Ko par écran chargé à la demande, 160 Ko pour la vidéo ; `pnpm build` échoue au-delà |
| `sw.js` | Source unique du service worker, copiée dans `public/` de chaque application (un test vérifie l'identité) |

Paquet source (TypeScript servi tel quel aux applications par Vite) : pas d'étape de construction.
