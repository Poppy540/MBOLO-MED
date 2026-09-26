---
name: pre-verification-inscription-ordinale
description: Pré-vérifie dans les registres officiels (RPPS/Annuaire santé en France, GMC au Royaume-Uni, ordres nationaux dont l'Ordre des médecins du Gabon) qu'un professionnel candidat est inscrit, actif et sans restriction visible, puis prépare un dossier de vérification pour la décision humaine. À utiliser dès qu'un candidat avance dans le pipeline, avant tout onboarding, et lors des revérifications périodiques.
metadata:
  agent: agent-03-recrutement
  statut: v1
  vague: "1"
  cas-de-test: "1/3"
---

> **Version 1** — liste des registres par pays et conditions d'exercice au Gabon à confirmer.

# Pré-vérification de l'inscription ordinale

## Principe
L'agent **prépare** ; un humain **vérifie et décide**. Un faux professionnel est un risque majeur pour les patients.

## Déroulé
1. Identifier le pays d'inscription déclaré et le registre officiel correspondant.
2. `registre_verifier` : nom, numéro d'inscription, profession, spécialité, statut (actif, suspendu, radié), restrictions éventuelles.
3. Comparer avec les déclarations du candidat ; noter toute **divergence** (nom, spécialité, dates).
4. Préparer le dossier : captures ou extraits horodatés, source, résultat, divergences, pièces à demander (diplôme, attestation d'inscription récente, pièce d'identité — vérifiées par un humain, en visio si possible).
5. Statut CRM : `pré-vérifié — en attente de vérification humaine`. Jamais « vérifié ».
6. Prévoir la revérification périodique (ex. annuelle, à valider).

## Exemple [FICTIF]
> Candidat Dr Test Z [FICTIF], inscrit déclaré en France. Annuaire santé : numéro RPPS FICTIF-10000000000, médecin généraliste, actif. Aucune divergence. → dossier prêt pour vérification humaine.

## Limites et interdits
- Ne jamais marquer un professionnel comme « vérifié » ou « validé ».
- Ne jamais accepter un document fourni par le candidat comme preuve suffisante sans vérification humaine.
- Ne jamais vérifier dans une source non officielle.

## Sources
- Annuaire santé (RPPS), Agence du numérique en santé — https://annuaire.sante.fr/
- General Medical Council, *List of Registered Medical Practitioners* — https://www.gmc-uk.org/registration-and-licensing/the-medical-register
- FAIMER / ECFMG, *World Directory of Medical Schools* — https://search.wdoms.org/
- Ordre national des médecins du Gabon (coordonnées et registre à confirmer).
