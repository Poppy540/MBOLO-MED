# Modèle de menaces — Mbolo Santé

> Squelette, méthode STRIDE (skill `modelisation-menaces-stride` du sous-agent `pilote-securite`). À compléter module par module et à revoir à chaque vague.

## Périmètre et actifs
| Actif | Sensibilité |
|---|---|
| Dossier médical FHIR | Très élevée (données de santé) |
| Conversations patients avec les agents IA | Très élevée |
| Ordonnances électroniques | Très élevée (intégrité critique) |
| Identifiants et secrets | Critique |
| Paiements | Élevée |

## Menaces prioritaires initiales (à détailler)
| STRIDE | Menace | Exemple | Mesure prévue |
|---|---|---|---|
| S (usurpation) | Faux professionnel de santé | Diplôme falsifié | Vérification humaine de l'inscription ordinale |
| T (altération) | Ordonnance modifiée | Posologie changée en transit | Signature électronique, intégrité vérifiée par la pharmacie |
| R (répudiation) | Contestation d'un acte | « Je n'ai pas prescrit cela » | AuditEvent / Provenance FHIR, journaux immuables |
| I (divulgation) | Fuite de données de santé | Accès à un autre dossier | Contrôle d'accès par patient, chiffrement, journalisation |
| D (déni de service) | Plateforme indisponible | Pic ou attaque | Supervision, dégradation vers audio/SMS |
| E (élévation) | Injection de prompt sur un agent | Message patient « ignore tes consignes » | `garde-fous-communs`, outils à portée minimale, OWASP LLM01 |

## Mesures en place (vague 0, données fictives) — vérifiées par des tests automatisés

| STRIDE | Menace | Mesure | Preuve |
|---|---|---|---|
| S | Vol de mot de passe d'un professionnel | Double authentification (TOTP) obligatoire pour les rôles professionnels | e2e `identite/double-authentification.feature` |
| S | Interception du code d'autorisation | PKCE S256 obligatoire, connexion directe par mot de passe désactivée | e2e `identite/connexion-keycloak.feature` |
| S / E | Un utilisateur se rattache au dossier d'un autre | `patient_id`, `practitioner_id` et `related_person_id` modifiables par l'administrateur seul | e2e + test `royaume.test.ts` |
| T | Jeton forgé ou altéré | Signature, émetteur et audience vérifiés (`identite`, passerelle) | tests unitaires + e2e (401) |
| I | Accès au dossier sans consentement | Refus par défaut ; consentement actif qui désigne le bénéficiaire ; révocation immédiate (recherche sans cache) | e2e `identite/acces-dossier.feature` |
| I | Un service lit plus que nécessaire | Passerelle : permissions SMART par type ; `_include` et chaînage refusés ; HAPI jamais exposé | e2e `dossier/passerelle.feature` |
| I | Données personnelles dans le jeton | Jeton sans e-mail ni nom | e2e |
| R | Contestation d'un accès (bris de glace) | `AuditEvent` pour chaque décision, justification conservée, traces immuables, historique visible par le patient | e2e + tests unitaires |
| E | Bris de glace abusif | Revue humaine outillée (rôle `revue-acces`), retards signalés, conclusion tracée, pas d'auto-revue, alerte si l'accès est contesté | e2e `identite/revue-bris-de-glace.feature` + tests unitaires |
| T | Suppression ou modification de traces et de consentements | Suppression jamais relayée ; `AuditEvent` et `Provenance` non modifiables | tests de la passerelle + e2e |
| E | Fonction activée trop tôt | Feature flags désactivés par défaut, refus si Unleash est injoignable, aucun flag sur la sécurité | tests `@mbolo/drapeaux` + e2e |
| I | Fuite de secrets | Aucun secret dans le dépôt (gitleaks, modèles `CHANGEME`, secrets injectés à l'import) ; secrets de CI générés et masqués | CI « Sécurité » |

**Reste à traiter avant la vague 1 :**
- authentification des services par clé asymétrique ;
- réseau privé et TLS ;
- revue humaine des bris de glace : désigner les relecteurs et fixer le délai (l'outil est prêt) ;
- limitation de débit (déni de service) ;
- supervision ;
- test d'intrusion externe.
