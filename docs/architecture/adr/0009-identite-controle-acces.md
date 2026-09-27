# ADR-0009 — Identité, contrôle d'accès au dossier et consentements

- **Date :** 2026-09-27
- **Statut :** proposée (à valider par le porteur de projet à la fusion de la PR C)

## Contexte
Le dossier médical (service `dossier-fhir`, ADR-0001) ne doit être lu que par les personnes que le patient a autorisées (principe n°3 : consentement explicite et révocable, journalisation des accès). Il faut :
- authentifier patients, proches, professionnels, infirmiers, pharmaciens, administrateurs et agents IA ;
- décider, pour chaque demande, si l'accès au dossier d'un patient est autorisé ;
- permettre au patient de donner et de retirer ses consentements ;
- prévoir l'urgence (bris de glace) sans en faire une porte dérobée.

## Options envisagées
1. **Keycloak (open source, auto-hébergeable, OIDC)** + un service `identite` qui porte les règles d'accès et l'API de consentement.
2. Fournisseur d'identité SaaS (Auth0, Cognito…) — rapide, mais données d'identité hors de notre hébergement HDS et coût par utilisateur actif.
3. Authentification maison — risque de sécurité élevé, à proscrire.

## Décision
Option 1.
- **Keycloak 26**, royaume `mbolo` (`platform/services/identite/keycloak/realm-mbolo.json`) : 7 rôles de royaume (`patient`, `proche`, `professionnel`, `infirmier`, `pharmacien`, `administrateur`, `agent-ia`), pas d'inscription publique, protection contre la force brute, politique de mot de passe, jetons d'accès de 5 minutes, clients publics avec **PKCE S256**.
- Les liens vers le dossier (`patient_id`, `practitioner_id`, `related_person_id`) sont des **attributs réservés à l'administrateur**, copiés dans le jeton. Un utilisateur ne peut pas les modifier lui-même.
- **Service `identite`** (Fastify, `jose`) : vérifie le jeton (émetteur, audience, signature par JWKS), puis applique `deciderAccesDossier` :
  - le patient accède à son dossier ;
  - un professionnel ou un infirmier seulement avec un consentement `C-PARTAGE-PRO` actif qui le désigne ;
  - un proche seulement avec un consentement `C-PROCHE` actif qui le désigne ;
  - un agent IA seulement pour le patient de sa session, avec le consentement `C-SOINS` ;
  - pharmacien et administrateur : pas d'accès clinique au dossier ;
  - **refus par défaut** dans tous les autres cas.
- **Consentements** stockés comme ressources FHIR `Consent` (profil `MboloConsent`, validées par `@mbolo/dossier-fhir`). Un consentement de partage doit désigner son bénéficiaire (invariant `mbolo-consent-1`). La révocation passe le consentement en `inactive` : il est conservé pour la traçabilité, jamais supprimé.
- **Bris de glace** : un professionnel peut accéder sans consentement **en urgence**, avec un motif écrit obligatoire. L'accès est journalisé en alerte pour une **revue humaine a posteriori** (principes n°2 et n°7).
- **MFA (OTP) obligatoire** pour professionnel, infirmier, pharmacien et administrateur : rôle technique `mfa-requise` inclus dans ces rôles et flux de connexion `navigateur-mbolo` avec OTP conditionnel.
- **Minimisation** : ni e-mail ni nom dans le jeton d'accès (portées `profile` et `email` optionnelles).
- **Profil utilisateur intégré au royaume** : les attributs de rattachement au dossier ne sont modifiables que par l'administrateur, dès l'import.

## Conséquences
- Le dépôt de consentements est **en mémoire** en vague 0 : le service refuse de démarrer en production. Il sera remplacé par le serveur FHIR (HAPI) avant la vague 1.
- Keycloak doit être hébergé chez l'hébergeur HDS (ADR-0004) ; le mot de passe d'administration initial vient du coffre-fort (ADR-0005), jamais du dépôt.
- La revue des bris de glace (qui, sous quel délai) est à définir avec le comité médical et le responsable sécurité.
- La traduction complète des écrans Keycloak et le parcours de récupération d'un appareil OTP perdu (procédure humaine vérifiée) restent à faire.

Sources : Keycloak — https://www.keycloak.org/documentation ; OAuth 2.0 for Browser-Based Apps (PKCE) — https://datatracker.ietf.org/doc/html/rfc7636 ; HL7 FHIR R4 Consent — https://hl7.org/fhir/R4/consent.html ; OWASP ASVS v4 (V2, V4) — https://owasp.org/www-project-application-security-verification-standard/
