# Déploiement par vagues — Mbolo Santé

> **Proposition à valider par le porteur de projet.** Le prompt fondateur fixe la vague 0 comme point de départ et la convention CNAMGS en vague 4 ; le contenu des vagues 1 à 3 est une proposition cohérente avec ces deux points de repère.
> La plateforme est construite complète, puis **activée progressivement** par feature flags (ville, spécialité, type d'utilisateur).

## Principe

- Une vague = un ensemble de fonctions activées pour une population donnée.
- On passe à la vague suivante **uniquement** si les critères de passage sont remplis et que le porteur de projet décide de passer, sur la base d'un **dossier de passage de vague** préparé par l'Agent 6 (skill `criteres-passage-vague`).
- La revue mensuelle de vague recommande : **étendre**, **maintenir** ou **corriger**. Le retour arrière (désactivation d'un flag) est toujours possible et prévu.

## Vague 0 — Fondations (aucun patient réel)

**Contenu :** dépôt, sécurité, secrets, permissions ; salle de contrôle (Agent 6) ; identité et consentement ; dossier FHIR (données fictives) ; feature flags ; chaîne de tests Gherkin + Playwright ; documents de conformité (registre des traitements, AIPD, modèle de menaces, plan d'incident).

**Agents actifs :** Agent 6 (niveaux 1 à 3). Agents 1 à 5 en conception et évaluation sur cas fictifs uniquement.

**Critères de passage vers la vague 1 :**
- [ ] Cadre légal de la téléconsultation au Gabon clarifié par écrit (juriste), y compris pour un médecin exerçant depuis l'étranger.
- [ ] Hébergement des données de santé décidé et contractualisé.
- [ ] AIPD réalisée et validée ; registre des traitements tenu.
- [ ] Comité médical constitué ; protocole de triage et liste des signaux d'alarme **validés et signés**.
- [ ] Skills de l'Agent 1 et de l'Agent 4 utilisés en vague 1 passés en version complète, avec **au moins 3 cas de test chacun, tous au vert**.
- [ ] 100 % des cas de test « refus / escalade » des agents actifs au vert.
- [ ] Scans de sécurité sans vulnérabilité critique ou haute ouverte ; test d'intrusion externe réalisé.
- [ ] Plan d'incident testé (exercice sur table).
- [ ] Au moins N médecins recrutés et vérifiés par un humain (N à fixer).

## Vague 1 — Pilote Libreville, médecine générale sur smartphone

**Contenu :** téléconsultation de médecine générale (vidéo avec repli audio), Agent 1 (accueil, triage, orientation, résumé pré-consultation), paiement mobile money, SMS / WhatsApp, français uniquement, population limitée (liste d'attente ou code d'invitation).

**Agents actifs :** 1, 3 (recrutement, interne), 4 (audit), 6.

**Critères de passage vers la vague 2 (exemples, seuils à fixer) :**
- [ ] Zéro incident grave de sécurité patient non maîtrisé ; tout signal d'urgence orienté vers les secours en moins de X secondes dans 100 % des cas audités.
- [ ] Taux d'erreur de triage mesuré par l'Agent 4 sous le seuil fixé par le comité médical.
- [ ] Taux de réussite des consultations (connexion établie, consultation menée à terme) ≥ seuil, y compris en 3G (mesuré par le [protocole de test terrain](test-terrain-faible-debit.md)).
- [ ] Satisfaction patients et professionnels ≥ seuil.
- [ ] Coûts réels dans la tolérance du business plan.
- [ ] Skills de la vague 2 en version complète avec 3 cas de test au vert.

## Vague 2 — Points de consultation assistée, pharmacies, spécialistes, diaspora

**Contenu :** points de consultation assistée (infirmier + objets connectés) dans des pharmacies partenaires ; ordonnances électroniques et vérification des stocks (Agent 2) ; consultations spécialisées ; abonnement Diaspora « Famille » (paiement carte, consentement des proches) ; partenariats pharmacie.

**Agents actifs :** 1, 2, 3, 4, 6.

**Critères de passage vers la vague 3 :** validité des ordonnances électroniques confirmée ; circuit de pharmacovigilance opérationnel ; maintenance du matériel des points assistés sous contrôle ; indicateurs de la vague 2 au vert.

## Vague 3 — Province, équipe pluridisciplinaire élargie, langues locales, Académie

**Contenu :** extension en province (mode hors ligne, faible débit renforcé) ; laboratoires, téléradiologie, santé mentale, sages-femmes, diététiciens, travailleurs sociaux ; interprètes et premières langues locales (fang, punu, myènè, nzébi…) ; parcours chroniques (diabète, hypertension, drépanocytose, VIH, grossesse) ; Académie Mbolo (Agent 5).

**Agents actifs :** 1 à 6.

## Vague 4 — Institutionnalisation

**Contenu :** convention **CNAMGS** ; interopérabilité avec **eGabon-SIS** (en complément, jamais en concurrence) ; offres entreprises ; agents de santé communautaire, kinésithérapeutes, ophtalmologistes, dentistes, transporteurs sanitaires.

## Règle transverse : skills et cas de test

Un skill en statut `v1` a au moins 1 cas de test. **Avant qu'une fonction qui l'utilise soit activée, il doit passer en statut `complet` avec au moins 3 cas de test, dont au moins un refus ou une escalade, tous au vert.** L'Agent 6 (skill `criteres-passage-vague`) vérifie ce point dans chaque dossier de passage.
