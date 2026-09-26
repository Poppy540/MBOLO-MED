# D-0001 — Décisions initiales du projet

- **Date :** 2026-09-26
- **Décideur :** porteur de projet
- **Source :** prompt fondateur « Initialisation du projet Mbolo Santé » et échanges de la session d'initialisation
- **Statut :** validée

## Décisions

1. **Positionnement** : plateforme de téléconsultation reliant des professionnels de santé du monde entier à des patients gabonais, dans un premier temps. Le besoin est considéré comme validé.
2. **Construction et activation** : la plateforme est construite complète, puis activée progressivement par vagues et feature flags, selon l'accueil terrain.
3. **Modèle de soins hybride** : smartphone du patient + points de consultation assistée (pharmacies partenaires, centres de santé) avec infirmier et objets connectés (tensiomètre, oxymètre, thermomètre, stéthoscope et otoscope numériques, glucomètre).
4. **Équipe pluridisciplinaire** : médecins, infirmiers, sages-femmes, pharmaciens, laboratoires, radiologues, psychologues et psychiatres, diététiciens, travailleurs sociaux ; puis agents de santé communautaire, kinésithérapeutes, ophtalmologistes, dentistes, transporteurs sanitaires, interprètes.
5. **Pharmacies locales** : ordonnances électroniques, vérification des stocks, génériques. **Académie Mbolo** : mise en relation étudiants–mentors.
6. **Contexte gabonais** : faible débit par défaut, repli audio, hors ligne ; smartphones d'entrée de gamme ; vocal, pictogrammes, peu de texte ; français puis langues locales.
7. **Paiement** : mobile money (Airtel Money, Moov Money) ; carte bancaire pour la diaspora.
8. **Institutions** : complément d'eGabon-SIS (jamais concurrent, interopérabilité prévue) ; convention CNAMGS visée en vague 4.
9. **Modèle économique** (hypothèses) : MG 10 000 FCFA ; spécialisée 15 000 FCFA ; Diaspora « Famille » 25 €/mois ; partenariat pharmacie 50 000 FCFA/mois ; offres entreprises ; 55 % reversés au professionnel ; rentabilité année 3 ; point mort à ~75 % du volume prévu de l'année 3. Le tableur fait foi.
10. **Standards** : HL7 FHIR (serveur open source type HAPI FHIR) ; WebRTC faible débit (LiveKit ou Jitsi) ; Gherkin + Playwright ; feature flags.
11. **Agents IA** : six agents ; aucun ne pose de diagnostic, ne prescrit ni ne décide médicalement ; Agent 6 démarre aux niveaux d'autonomie 1 à 3.
12. **Secrets** : `secrets/` contient l'inventaire et des modèles, jamais de valeurs ; clé API Claude exclue de l'inventaire.
13. **Cas de test (option C)** : 3 cas pour les skills vague 0 et les skills cliniques ; 1 cas pour les skills V1 ; 3 cas au vert obligatoires avant l'activation de toute fonction utilisant un skill. Garde-fous : statut dans le frontmatter, critère de passage de vague, contrôle par l'Agent 6, règle dans `CLAUDE.md`.
14. **Skills supplémentaires validés** : `garde-fous-communs` (partagé), `interoperabilite-egabon-sis` (pilote-architecture), `pseudonymisation-donnees` (Agent 4), `coordination-interpretes` (Agent 1).
15. **Méthode** : étapes 2 à 7 enchaînées avec un point à la fin de chaque étape.
16. **Nom d'usage** : « Mbolo Santé » (dépôt `MBOLO-MED`).
