# Plan de réponse aux incidents — Mbolo Santé

> Squelette (skill `reponse-incident`). À tester par un exercice sur table avant la vague 1.

## Gravité
| Niveau | Exemples | Délai d'alerte |
|---|---|---|
| **Critique** | Urgence patient mal orientée ; fuite de données de santé ; ordonnance altérée ; secret exposé | **Immédiat** |
| Élevé | Indisponibilité de la téléconsultation ; agent qui sort de son périmètre | < 1 h |
| Moyen | Dégradation de performance ; anomalie de paiement | < 24 h |

## Circuit d'alerte
- Sécurité patient → **directeur médical de garde** (+ porteur de projet informé).
- Sécurité des données → **responsable sécurité** (+ porteur de projet informé).
- L'Agent 6 alerte ; il ne retarde jamais une alerte ; il n'agit pas en production.

## Étapes
1. Détecter et qualifier. 2. Contenir (désactiver un flag, révoquer une clé — par un humain). 3. Éradiquer. 4. Rétablir. 5. Notifier (autorités, personnes concernées si requis). 6. Retour d'expérience → `memory.md` (leçons apprises) et fiche problématique.

## Contacts (à compléter — rôles, pas de données personnelles dans le dépôt)
Directeur médical de garde · Responsable sécurité · Porteur de projet · Hébergeur · Prestataires critiques.
