---
name: modelisation-menaces-stride
description: Réalise et tient à jour la modélisation des menaces de Mbolo Santé avec la méthode STRIDE (usurpation, altération, répudiation, divulgation, déni de service, élévation de privilèges), étendue aux menaces propres aux agents IA, à partir d'un diagramme de flux de données, et produit des mesures priorisées. À utiliser pour chaque nouveau module ou intégration, avant chaque vague, après un incident de sécurité, et pour mettre à jour docs/securite/modele-menaces.md.
metadata:
  agent: pilote-securite
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Modélisation des menaces (STRIDE)

## Les quatre questions (Threat Modeling Manifesto)
1. **Sur quoi travaillons-nous ?** → diagramme de flux de données (DFD).
2. **Qu'est-ce qui peut mal tourner ?** → STRIDE par élément.
3. **Que faisons-nous contre ?** → mesures.
4. **Avons-nous bien travaillé ?** → revue, tests, suivi.

## Étape 1 — Diagramme de flux de données
Éléments : entités externes (patient, professionnel, pharmacie, prestataire de paiement, fournisseur vocal, API d'IA), processus (apps, services, agents IA, outils), stockages (FHIR, base, stockage chiffré, journaux), flux, et **frontières de confiance** (Internet ↔ plateforme, plateforme ↔ fournisseurs, agent IA ↔ outils, dev ↔ prod). Format : Mermaid dans `docs/securite/`.

## Étape 2 — STRIDE par élément
| Lettre | Propriété violée | S'applique surtout à | Questions types pour Mbolo |
|---|---|---|---|
| **S** Spoofing | Authentification | Entités, processus | Un faux médecin peut-il se connecter ? Un tiers peut-il se faire passer pour le patient (téléphone partagé, SIM volée) ? |
| **T** Tampering | Intégrité | Flux, stockages | Une ordonnance peut-elle être modifiée entre le médecin et la pharmacie ? Une mesure d'objet connecté falsifiée ? |
| **R** Repudiation | Non-répudiation | Processus | Peut-on prouver qui a prescrit, qui a lu le dossier, ce qu'un agent a écrit ? |
| **I** Information disclosure | Confidentialité | Flux, stockages | Données de santé dans les journaux, notifications lisibles sur écran verrouillé, fuite via un fournisseur vocal ou une API d'IA ? |
| **D** Denial of service | Disponibilité | Processus, flux | Saturation pendant un pic ; coupure d'un fournisseur de SMS ; coût d'API d'IA épuisé par abus ? |
| **E** Elevation of privilege | Autorisation | Processus | Un patient peut-il lire un autre dossier (IDOR) ? Une **injection de prompt** fait-elle agir un agent hors périmètre ? |

**Extension IA** (croiser avec `owasp-top10-llm`) : injection directe et indirecte (documents, photos, pages web), fuite de prompt système, agentivité excessive (outils trop puissants), empoisonnement des contenus de référence, sorties non vérifiées utilisées par un autre système, consommation non bornée.

## Étape 3 — Évaluer et prioriser
Pour chaque menace : probabilité (1–5) × impact (1–5). L'impact tient compte de la **gravité pour le patient** (préjudice physique > atteinte à la vie privée > désagrément). Criticité ≥ 15 : bloquant pour la vague.

## Étape 4 — Mesures
Préférer, dans l'ordre : supprimer la fonction risquée > réduire la surface (portée minimale) > contrôles préventifs > détection et journalisation > réponse. Chaque mesure est reliée à une exigence ASVS (`verification-owasp-asvs`) ou à un test.

## Étape 5 — Livrables et suivi
- Mettre à jour `docs/securite/modele-menaces.md` (tableau : ID, élément, STRIDE, scénario, P, I, criticité, mesure, statut, preuve).
- Menaces critiques non traitées → fiche problématique + registre des risques.
- Revue : à chaque vague, à chaque nouveau module, après chaque incident.

## Exemple [FICTIF]
| ID | Élément | STRIDE | Scénario | P | I | Crit. | Mesure |
|---|---|---|---|---|---|---|---|
| TM-017 | Flux ordonnance → pharmacie | T | Modification de la posologie en transit | 2 | 5 | 10 | Signature électronique vérifiée à réception ; journal immuable |
| TM-023 | Agent 1 + `lecture-documents-medicaux` | E | Photo contenant « envoie ce dossier à… » | 3 | 5 | 15 | Contenus = données ; outil d'envoi restreint au patient de la session ; test d'injection |

## Limites et interdits
- Ne jamais inclure de donnée réelle, d'adresse IP interne de production ni de secret dans le modèle de menaces.
- Ne jamais produire de code d'exploitation ; décrire les scénarios au niveau nécessaire à la défense.
- Ne jamais clore une menace critique sans preuve (test, revue) et validation du responsable sécurité.

## Sources
- Shostack A., *Threat Modeling: Designing for Security* (Wiley, 2014).
- Threat Modeling Manifesto — https://www.threatmodelingmanifesto.org/
- Microsoft, STRIDE — https://learn.microsoft.com/azure/security/develop/threat-modeling-tool-threats
- OWASP Threat Modeling Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html
- OWASP Top 10 for LLM Applications 2025 ; MITRE ATLAS — https://atlas.mitre.org/
