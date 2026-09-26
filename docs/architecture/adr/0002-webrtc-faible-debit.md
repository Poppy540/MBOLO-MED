# ADR-0002 — Vidéo WebRTC adaptée au faible débit

- **Date :** 2026-09-26
- **Statut :** acceptée ; outil (LiveKit ou Jitsi) à choisir

## Contexte
Réseau majoritairement 3G/4G, forte variabilité en province, smartphones d'entrée de gamme.

## Décision
- WebRTC avec serveur SFU open source (LiveKit ou Jitsi), TURN obligatoire.
- Profil par défaut **faible débit** : résolution réduite, simulcast, codec audio Opus à bas débit, **repli audio automatique**, puis repli téléphone/messagerie si la connexion échoue.
- Mesure systématique de la qualité (perte, gigue, débit) pour le pilotage.

## Conséquences
- Critère de sélection à mesurer par test terrain (skill `tests-terrain-reseau-mobile`).
- Hébergement des serveurs média au plus près du Gabon pour limiter la latence.
