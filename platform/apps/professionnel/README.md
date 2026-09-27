# Espace professionnel (prototype)

PWA légère (Preact + Vite, **10,6 Ko** compressés à l'ouverture) pour les professionnels de santé, sur le même modèle que l'application patient. Briques communes dans `@mbolo/client-web`.

## Parcours

1. **Connexion** : Keycloak, client public `mbolo-app-pro`, PKCE S256, **double authentification obligatoire** (rôle professionnel).
2. **Rendez-vous à venir** : « Rejoindre », « Reporter » (vers un de ses créneaux libres ; le patient est prévenu), « Annuler ».
3. **Mes créneaux** : publier 1 à 16 créneaux consécutifs (date et heure **au fuseau du pays déployé**, durée 15, 20 ou 30 min) ; liste des créneaux libres et réservés sur 14 jours ; « Retirer » un créneau libre.
4. **Téléconsultation** : même écran que le patient (vidéo 216p, repli audio automatique ou choisi).

Aucune donnée de santé n'est affichée ici : le dossier du patient s'ouvre par ses consentements (service `identite`).

## Déploiement dans un autre pays

Mêmes variables que l'application patient (`VITE_KEYCLOAK_ISSUER`, `VITE_KEYCLOAK_CLIENT`, défaut `mbolo-app-pro`, `VITE_FUSEAU`, `VITE_LANGUE`). L'heure saisie est convertie en instant selon `VITE_FUSEAU`, heure d'été comprise.

## Lancer

```bash
pnpm --filter @mbolo/app-professionnel build
pnpm --filter @mbolo/app-professionnel preview   # http://localhost:5181
```

## Tests

- **Unitaires** : routes et corps des appels ; conversion date et heure → instant (dans `@mbolo/client-web`).
- **E2E** (`features-gherkin/teleconsultation/espace-professionnel.feature`), vrai navigateur, double authentification :
  - publication de créneaux à l'heure du Gabon, puis retrait ;
  - report d'un rendez-vous sur un de ses créneaux (vérifié dans le dossier) ;
  - patient et médecin se retrouvent, chacun depuis son application.
