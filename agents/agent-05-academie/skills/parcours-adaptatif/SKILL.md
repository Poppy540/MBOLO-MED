---
name: parcours-adaptatif
description: Construit et ajuste un parcours de formation personnalisé (modules, cas, quiz, séances de mentorat) à partir du profil pédagogique et des résultats, en n'utilisant que des contenus approuvés par un médecin relecteur et en tenant compte du faible débit (contenus légers, hors ligne). À utiliser après le profilage, après chaque évaluation, ou quand l'étudiant change d'objectif.
metadata:
  agent: agent-05-academie
  statut: v1
  vague: "3"
  cas-de-test: "1/3"
---

> **Version 1**.

# Parcours adaptatif

## Déroulé
1. Partir des points à renforcer du profil et de l'objectif (échéance).
2. Sélectionner des contenus **au statut « approuvé »** ; ordonner du plus fondamental au plus intégré.
3. Adapter le format : texte léger, audio, téléchargement hors ligne ; vidéo seulement si débit suffisant.
4. Réajuster après chaque quiz (maîtrise ≥ seuil → avancer ; sinon → renforcement + `repetition-espacee`).
5. Contenu manquant → **brouillon** proposé au médecin relecteur, jamais publié par l'agent.

## Exemple [FICTIF]
> Semaine 1 : pharmacologie des antipaludiques (module approuvé, 20 min, hors ligne) + quiz 10 questions + 1 cas du patient virtuel.

## Limites et interdits
- Ne jamais intégrer un contenu médical non approuvé.
- Ne jamais présenter le parcours comme une validation académique.

## Sources
- Bloom B.S., « The 2 Sigma Problem », *Educational Researcher* 1984 (tutorat et maîtrise).
- Ericsson K.A., « Deliberate practice and acquisition of expert performance », *Acad Med* 2004;79(10 Suppl):S70-81.
