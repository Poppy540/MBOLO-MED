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
