# Conditions d'utilisation pour les proches — BROUILLON v0.1

> **Brouillon à valider par le juriste avant toute mise en production** (accord du porteur de projet du 2026-09-28, ADR-0019).
> Version : `c-utilisation-proche-v0.1`. Affiché à l'inscription du proche par Keycloak (action requise « Terms and Conditions »), mot pour mot, depuis `platform/services/identite/keycloak-extension/src/main/resources/theme/mbolo/login/messages/messages_fr.properties` (clés `termsTitle` et `termsText`). Toute modification du texte change la version, ici et dans le thème.

## Texte affiché

**Conditions d'utilisation pour les proches**

Un patient vous a invité à l'aider à suivre son traitement. Avant d'accéder à ses informations, lisez et acceptez ces conditions.

1. **Ce que vous voyez** : ses ordonnances et les consignes de son médecin (« Ce qu'il faut faire »), jamais le reste de son dossier.
2. **Usage personnel** : ces informations servent seulement à aider le patient. Ne les copiez pas, ne les photographiez pas et ne les transmettez à personne.
3. **Votre compte** : il est personnel. Ne donnez ni votre mot de passe ni vos codes de connexion.
4. **Transparence** : chaque fois que vous consultez ces informations, c'est enregistré, et le patient peut le voir.
5. **Accès retiré** : le patient peut retirer votre accès à tout moment, sans avoir à se justifier. L'équipe Mbolo Santé peut aussi le faire à sa demande.
6. **Urgence** : Mbolo Santé n'est pas un service d'urgence. En cas d'urgence, appelez les secours.

_Conditions d'utilisation pour les proches, version c-utilisation-proche-v0.1 (brouillon)._

## Fonctionnement

- Le proche doit **accepter** ces conditions juste après son inscription, avant tout accès : sans acceptation, pas de connexion.
- Keycloak enregistre la **date d'acceptation** sur le compte du proche (attribut `terms_and_conditions`).
- Les patients ne voient pas ce texte : l'action n'est demandée qu'aux comptes créés avec un code de proche.

## Points à valider par le juriste

1. Valeur de l'acceptation en ligne, et conséquences d'un manquement (divulgation par le proche).
2. Mention de la base légale et des droits du proche sur **ses propres** données (prénom, compte, traces de lecture).
3. Faut-il une nouvelle acceptation à chaque nouvelle version ? (Proposé : oui, pour toute modification de fond.)
4. Coordonnées du responsable de traitement et du DPO à ajouter.
5. Traduction dans les langues locales (vague ultérieure).
