---
name: verification-owasp-asvs
description: Vérifie la plateforme Mbolo Santé contre l'OWASP Application Security Verification Standard (ASVS 5.0) au niveau 2 minimum, et niveau 3 pour les fonctions critiques (dossier médical, ordonnances, authentification, paiement), tient la matrice de conformité exigence par exigence avec preuves, et propose les corrections. À utiliser avant chaque vague, pour chaque nouveau module, lors d'une revue de sécurité, et pour préparer un test d'intrusion.
metadata:
  agent: pilote-securite
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Vérification OWASP ASVS

## Niveau cible
- **Niveau 2** pour toute la plateforme (application qui traite des données sensibles).
- **Niveau 3** pour : service dossier-fhir, ordonnances, identité et authentification, paiement, outils utilisés par les agents IA.

## Chapitres prioritaires (ASVS 5.0) et points propres à Mbolo
| Domaine ASVS | Points de vigilance Mbolo Santé |
|---|---|
| Encodage et assainissement des entrées | Messages patients, noms de fichiers, champs FHIR libres ; injection dans les outils des agents |
| Validation et logique métier | Une ordonnance ne peut être transmise que si signée ; un paiement ne débloque jamais un accès à un autre patient |
| Authentification | MFA pour les professionnels et l'administration ; patients : OTP SMS/WhatsApp + protection contre le vol de SIM ; limitation des tentatives |
| Gestion de session | Expiration courte sur appareils partagés ; déconnexion à distance |
| Autorisation | Contrôle **par patient** à chaque requête (anti-IDOR) ; rôles professionnels ; accès délégués (proches) conformes au Consent |
| Jetons autonomes / OAuth / OIDC | SMART on FHIR, scopes minimaux par agent, durée de vie courte |
| Cryptographie | TLS 1.2+ partout ; chiffrement au repos ; clés dans un KMS |
| Protection des données | Pas de données de santé dans les journaux, URL, notifications d'écran verrouillé ; cache mobile chiffré |
| Journalisation et erreurs | AuditEvent pour tout accès au dossier ; journaux immuables ; messages d'erreur sans détail sensible |
| Sécurité des communications, configuration | En-têtes de sécurité, secrets hors code, dépendances à jour |
| Fichiers et ressources | Photos de documents : taille, type, analyse antivirus, stockage chiffré, URL signées à durée courte |
| API et web services | Limitation de débit, schémas stricts, idempotence des paiements |

## Déroulé
1. Choisir le périmètre (module) et le niveau.
2. Remplir la matrice `docs/securite/asvs-matrice.md` : ID d'exigence, applicable ?, statut (conforme / non conforme / partiel / non testé), **preuve** (test automatisé, revue, capture), action.
3. Automatiser ce qui peut l'être (tests d'autorisation, en-têtes, TLS) dans la CI.
4. Non-conformités niveau 2 sur fonctions critiques → bloquantes pour la vague ; fiche problématique.
5. Préparer le périmètre du test d'intrusion externe à partir des exigences non testables en interne.

## Exemple [FICTIF]
| Exigence | Statut | Preuve | Action |
|---|---|---|---|
| Autorisation — accès aux objets contrôlé par propriétaire | **Non conforme** | Test e2e FICTIF `idor-dossier.feature` en échec | Correctif service dossier-fhir, bloquant vague 1 |
| Journalisation — accès aux données sensibles journalisés | Conforme | Test `audit-event.spec.ts` | — |

## Limites et interdits
- Ne jamais marquer « conforme » sans preuve.
- Ne jamais tester sur la production ni sur des données réelles ; tests en recette avec données fictives.
- Ne jamais lancer de test intrusif sans autorisation écrite du porteur de projet.

## Sources
- OWASP ASVS 5.0 — https://owasp.org/www-project-application-security-verification-standard/
- OWASP Web Security Testing Guide — https://owasp.org/www-project-web-security-testing-guide/
- OWASP Mobile Application Security (MASVS) — https://mas.owasp.org/
- OWASP API Security Top 10 (2023) — https://owasp.org/API-Security/
