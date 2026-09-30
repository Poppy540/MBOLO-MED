# ADR-0023 — Changement du numéro de téléphone d'un patient

- **Date :** 2026-09-30
- **Statut :** acceptée (porteur de projet, 2026-09-30 : code à l'ancien et au nouveau numéro ; en cas de perte, vérification d'identité ; SMS d'alerte à l'ancien numéro ; 24 h d'attente après une perte)
- **Décideurs :** porteur de projet ; responsable sécurité (à désigner)

## Contexte

Le numéro du dossier (`Patient.telecom`) est vérifié par un code à l'inscription (revue ASVS n°2, C8). Il reçoit ensuite :

- les **codes de connexion** avant de payer, partager son dossier ou inviter un proche (ADR-0022) ;
- les **rappels de l'équipe d'assistance** (retrait des proches, récupération du compte, ADR-0019 et ADR-0021) ;
- les **alertes de sécurité** (proche inscrit, compte récupéré, proches retirés).

Aujourd'hui, **aucun parcours ne permet de changer ce numéro**. Or les patients changent de puce, perdent leur téléphone ou se le font voler. C'est aussi le point le plus sensible de la double authentification : **qui remplace le numéro reçoit ensuite tous les codes**. Un voleur de mot de passe ne doit pas pouvoir le faire.

Contraintes :

- **Faible littératie, téléphones d'entrée de gamme** : un parcours court, en mots simples.
- **Principes du projet** : aucun agent IA ne décide ; une action à effet réel à haut risque est validée par un humain ; les services ne modifient jamais de compte Keycloak ; la sécurité n'est jamais derrière un flag.
- **Données** : le numéro est une donnée personnelle du dossier ; il n'est jamais journalisé.

## Options envisagées

1. **Code à l'ancien et au nouveau numéro** (retenu pour le patient qui a encore son téléphone) : le patient prouve qu'il détient les deux numéros.
2. **Code au nouveau numéro seulement** : écarté, un voleur de mot de passe mettrait son propre numéro.
3. **Toujours par l'équipe** : écarté comme parcours normal (lent, coûteux) ; retenu seulement en cas de perte, sous la forme d'une vérification d'identité.

## Décision

### 1. Le patient a encore son ancien téléphone : il change lui-même son numéro

Dans l'application : « Changer mon numéro ».

1. **Code à l'ancien numéro** : c'est une **action sensible** (niveau 2, ADR-0022). Si le code SMS a plus de 15 minutes, Keycloak le redemande, envoyé au numéro actuel du dossier.
2. **Nouveau numéro, puis code au nouveau numéro** : même page que « Mon identité » (code à 6 chiffres, 5 minutes, 3 essais, « Corriger mon numéro »), par la route `POST /codes-verification` du service `notifications`.
3. **Dossier mis à jour** : seul `Patient.telecom` change, par la passerelle, avec une permission limitée à cet élément.
4. **SMS d'alerte à l'ancien numéro** : « Mbolo Santé : le numéro de votre compte vient d'être changé. Si ce n'est pas vous, contactez l'équipe. »
5. **Aucun délai** : l'ancien numéro a confirmé ; le nouveau sert tout de suite.

Réalisation : une **action requise Keycloak** `mbolo-changer-telephone`, lancée par l'application (action à l'initiative de l'application, `kc_action`) avec `acr_values=2`. Le mot de passe et les codes ne sortent jamais de Keycloak, comme pour l'inscription.

### 2. Le patient a perdu son téléphone : vérification d'identité par une personne habilitée

Dans l'application (connexion par mot de passe, niveau 1) : « J'ai perdu mon téléphone ».

1. **Nouveau numéro, puis code au nouveau numéro** : le patient prouve qu'il détient le nouveau numéro.
2. **Nouvelles photos** de la pièce d'identité et du visage, par le service `documents` (charte `C-IDENTITE` déjà acceptée, ADR-0015).
3. **Décision humaine** : une personne du rôle `verification-identite` (double authentification, jamais un agent IA) compare avec l'identité du dossier et, si elles sont encore conservées, avec les photos de l'inscription. Chaque consultation est tracée. Elle accepte ou refuse ; aucun texte libre.
4. **Si c'est accepté** : `Patient.telecom` change ; **SMS d'alerte à l'ancien numéro** (même texte) ; le changement est noté dans le dossier (date et « perte »).
5. **24 heures d'attente** : pendant 24 h après un changement pour perte, aucun code de connexion n'est envoyé. Payer, partager son dossier ou inviter un proche reprennent ensuite. Le vrai patient a ainsi le temps de réagir à l'alerte. Consulter, voir ses documents et retirer un accès restent possibles.

### 3. Règles communes

- **Une demande à la fois** : une seule demande « perte » ouverte par dossier ; au plus un changement par le patient toutes les 24 h.
- **Limites des codes** : celles des codes de connexion (par session, par dossier, par numéro) ; alertes `code-connexion` et `code-connexion-bloque`.
- **Traçabilité** : chaque changement est tracé (qui, quand, parcours), jamais le numéro ; alerte nommée `numero-change` pour la supervision (série de changements = attaque possible).
- **Pas de flag** : c'est une fonction de sécurité (sortir d'un numéro perdu).
- **Numéros des dossiers créés avant la PR n°101** : non vérifiés à l'inscription ; ils le deviennent au premier changement.

## Conséquences

- Un voleur de mot de passe ne peut ni changer le numéro seul, ni recevoir les codes.
- Un voleur de téléphone (et de mot de passe) peut changer le numéro par le parcours 1 : c'est le même risque que celui déjà accepté pour le vol de carte SIM (ADR-0022) ; l'alerte à l'ancien numéro et l'équipe d'assistance restent le recours.
- Le parcours « perte » coûte du temps humain (rôle `verification-identite`) ; il reste rare.
- Les photos de l'inscription peuvent avoir été supprimées (ADR-0015) : la personne habilitée compare alors avec l'identité du dossier seulement.

## Mise en œuvre (petites PR)

1. **Keycloak et dossier** : action requise `mbolo-changer-telephone` (niveau 2 exigé, code au nouveau numéro, mise à jour de `Patient.telecom` par la passerelle avec une permission limitée), SMS `numero-change` à l'ancien numéro, alerte `numero-change`. E2E.
2. **Application patient** : « Changer mon numéro » (`kc_action` + `acr_values=2`), retour à l'application.
3. **Perte du téléphone** : demande dans l'application (code au nouveau numéro, photos), écran de décision dans l'espace professionnel (`verification-identite`), attente de 24 h appliquée par le service `notifications` avant tout code de connexion. E2E.

## Sources

- ADR-0014 (inscription), ADR-0015 (vérification d'identité), ADR-0021 (récupération du compte), ADR-0022 (double authentification).
- Revue ASVS n°2 (`docs/securite/asvs-matrice.md`) : V6.6.1, C8.
- OWASP ASVS 5.0, chapitre 6 (authentification) ; NIST SP 800-63B, § 6.1.2 (remplacement d'un authentificateur perdu).
