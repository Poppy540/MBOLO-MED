# ADR-0012 — Service de notifications (SMS, WhatsApp) et gabarits approuvés

- **Date :** 2026-09-27
- **Statut :** proposée (à valider par le porteur de projet ; fournisseur SMS / WhatsApp à choisir)

## Contexte
Un rendez-vous de téléconsultation peut être annulé ou reporté par le patient ou par le professionnel (PR M, PR O). L'autre participant doit en être prévenu, sinon il se connecte pour rien ou manque le nouveau créneau.

Un SMS ou un message WhatsApp sort de la plateforme : il transite chez un opérateur, reste sur le téléphone, peut être lu par un proche. Il faut donc :
- **ne jamais y mettre de donnée de santé** : ni motif, ni spécialité, ni nom du professionnel ;
- ne prévenir un patient **qu'avec son consentement** aux rappels (`C-RAPPELS`, skill `recueil-consentement`), révocable à tout moment ;
- ne connaître le numéro de téléphone qu'au moment de l'envoi, sans le copier ailleurs que dans le dossier ;
- ne jamais journaliser le numéro ni le texte.

Le fournisseur (agrégateur SMS gabonais, WhatsApp Business) n'est pas encore choisi : c'est une décision du porteur de projet (contrat, coût, couverture Airtel et Moov).

## Options envisagées
1. **Service `notifications` dédié** : seul détenteur des clés du fournisseur, il reçoit une demande (destinataire, gabarit, variables), vérifie le consentement, lit le numéro dans le dossier et envoie.
2. Envoi direct par chaque service (téléconsultation, pharmacie…) : chaque service détiendrait une clé du fournisseur et devrait relire le numéro et le consentement ; plus de secrets, plus de surface d'attaque.
3. Numéros de téléphone dans Keycloak : ils sortiraient du dossier, contrairement à la minimisation (ADR-0009 : jeton sans nom ni e-mail).

## Décision proposée
Option 1.
- **Gabarits fermés** (`gabarits.ts`), en français, relus par le porteur de projet avant la mise en production : un identifiant, un texte et des variables typées (date, heure). **Aucun texte libre**, 160 caractères au plus (un SMS). Les gabarits ne nomment ni le professionnel ni la spécialité, et renvoient vers l'application.
- **Demande authentifiée** : jeton de service Keycloak, audience `mbolo-notifications`, et client appelant dans une liste autorisée (d'abord `mbolo-teleconsultation-service`).
- **Consentement** : pour un patient, un consentement `C-RAPPELS` actif et accepté est exigé ; sinon la notification est **ignorée** (pas d'erreur pour l'appelant). Les professionnels sont prévenus sans condition : c'est leur activité.
- **Numéro** : lu dans le dossier au moment de l'envoi (`Patient.telecom` ou `Practitioner.telecom`, avec `_elements=telecom`) par la passerelle, avec un compte de service limité à `system/Patient.r system/Practitioner.r system/Consent.s`.
- **Canal** : une interface `Canal` ; en attendant le choix du fournisseur, un **canal simulé** garde les messages en mémoire (développement et tests uniquement). Le service refuse de démarrer en production avec le canal simulé.
- **Pour l'appelant, la notification ne bloque jamais l'action** : une annulation reste enregistrée même si le message ne part pas. L'échec est journalisé.
- **Journal** : gabarit, type de destinataire et résultat (envoyé, ignoré sans consentement, ignoré sans numéro, échec), jamais le numéro ni le texte.

## Conséquences
- Nouveau service `platform/services/notifications`, nouveau compte de service `mbolo-notifications-service` (`NOTIFICATIONS_SERVICE_CLIENT_SECRET`).
- La lecture de `Patient` et `Practitioner` est restreinte par la passerelle à l'élément `telecom` (revendication `mbolo_elements`, PR Q) : le service ne voit ni le nom, ni la date de naissance, ni aucun autre élément.
- Gabarits organisés par langue, fuseau et langue paramétrables par déploiement (PR S) : le service est prêt pour d'autres pays que le Gabon.
- Reste à décider : fournisseur SMS et WhatsApp, numéro ou nom d'expéditeur, relecture des gabarits, langues locales, horaires d'envoi (pas la nuit).

Sources : skill `recueil-consentement` (catégorie C-RAPPELS) ; ADR-0009, ADR-0010, ADR-0011 ; principes n°3 et n°4 de `CLAUDE.md`.
