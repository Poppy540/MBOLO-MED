# Espace professionnel (prototype)

PWA légère (Preact + Vite, **12,5 Ko** compressés à l'ouverture) pour les professionnels de santé, sur le même modèle que l'application patient. Briques communes dans `@mbolo/client-web`.

## Parcours

1. **Connexion** : Keycloak, client public `mbolo-app-pro`, PKCE S256, **double authentification obligatoire** (rôle professionnel).
2. **Rendez-vous à venir** : « Rejoindre », « Reporter » (vers un de ses créneaux libres ; le patient est prévenu), « Annuler ».
3. **Mes créneaux** : publier 1 à 16 créneaux consécutifs (date et heure **au fuseau du pays déployé**, durée 15, 20 ou 30 min) ; liste des créneaux libres et réservés sur 14 jours ; « Retirer » un créneau libre.
4. **Dossier et compte-rendu** : depuis un rendez-vous, « Dossier » affiche les problèmes de santé et les comptes-rendus **si le patient a partagé son dossier** (sinon un message clair, et un **accès d'urgence** avec motif obligatoire, signalé et revu). Le professionnel rédige le compte-rendu (motif, observations, conclusion, conduite à tenir) ; aucune suggestion automatique.
5. **Téléconsultation** : même écran que le patient (vidéo 216p, repli audio automatique ou choisi).
6. **Vérifications à faire** (rôle `verification-identite`, ADR-0015 ; écran chargé à la demande, 2 Ko) : liste des patients à vérifier, identité déclarée et photos côte à côte (gardées en mémoire le temps de l'écran seulement ; **chaque ouverture est enregistrée dans le dossier du patient**), puis décision « vérifiée » (numéro d'assurance maladie ou provisoire), « refusée » (motif de la liste) ou « à refaire ». Un compte qui n'a que ce rôle arrive directement sur cet écran.
7. **Remboursements à valider** (rôle `validation-remboursement`, ADR-0017 ; écran chargé à la demande) : paiements reçus pour des rendez-vous annulés, avec montant, opérateur et date de préparation, **sans le patient ni le numéro**. « Valider » ou « Refuser », puis confirmer (deux clics, aucun texte libre) ; l'argent revient au téléphone qui a payé. Un compte qui n'a que ce rôle arrive directement sur cet écran.
8. **Assistance : aider un patient qui appelle** (rôle `assistance-patient` ; écran chargé à la demande, relais `/api/invitations`) : le patient qui ne peut pas agir dans son application appelle l'équipe. Numéro d'assurance ou provisoire → numéro de téléphone du dossier et nombre de proches, **rien d'autre** ; case « J'ai rappelé le patient à ce numéro » ; puis sa demande :
   - **Retirer tous ses proches** (ADR-0019) : date de naissance dite par le patient, **comparée par le service** (jamais affichée). Le patient reçoit un SMS de confirmation.
   - **Retrouver son compte** (ADR-0021, flag `compte.recuperation`) : date de naissance et **numéro lu par le patient sur sa carte**, comparés par le service. Le code de récupération s'affiche **une seule fois**, en grand, pour être dicté au patient (ou à son aidant, patient présent), avec son heure d'expiration ; le dossier n'est plus affiché, et le code disparaît dès que l'équipe clique « J'ai dicté le code ». Le patient le saisit dans « Mot de passe oublié ? ».
   - Chaque étape figure dans l'historique des accès du patient. Un compte qui n'a que ce rôle arrive directement sur cet écran.

Aucune donnée de santé n'est affichée ici : le dossier du patient s'ouvre par ses consentements (service `identite`).

## Hors ligne et économie de données

- **Service worker** (`public/sw.js`, identique dans les deux applications, source dans `@mbolo/client-web`) :
  - les fichiers de l'application (noms uniques par version) sont servis **depuis le téléphone** après la première visite : moins de données consommées ;
  - la page est demandée au réseau d'abord, puis servie depuis le téléphone s'il n'y en a pas ;
  - **l'API et la connexion (Keycloak) ne sont jamais mises en cache** (données personnelles, jetons).
- **Dernière liste de rendez-vous connue** : gardée sur le téléphone réduite à l'identifiant, l'horaire et la durée (ni professionnel, ni patient, ni motif), affichée sans réseau avec sa date de mise à jour, **effacée à la déconnexion**.
- Service worker actif seulement dans l'application construite (`pnpm build`), pas en développement.

## Déploiement dans un autre pays

Mêmes variables que l'application patient (`VITE_KEYCLOAK_ISSUER`, `VITE_KEYCLOAK_CLIENT`, défaut `mbolo-app-pro`, `VITE_FUSEAU`, `VITE_LANGUE`, `VITE_NOM_ASSURANCE`, `VITE_WEBRTC_URL`) et même politique de sécurité du contenu. L'heure saisie est convertie en instant selon `VITE_FUSEAU`, heure d'été comprise.

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
