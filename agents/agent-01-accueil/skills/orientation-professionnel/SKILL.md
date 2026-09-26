---
name: orientation-professionnel
description: Oriente le patient vers le type de professionnel et le délai prévus par le protocole validé (médecin généraliste, spécialiste, sage-femme, psychologue, pharmacien, point de consultation assistée, secours), propose les professionnels disponibles et laisse le patient choisir. À utiliser juste après triage-protocole-valide, ou quand le patient demande à changer de professionnel, de créneau ou de mode de consultation.
metadata:
  agent: agent-01-accueil
  statut: v1
  vague: "1"
  cas-de-test: "1/3"
---

> **Version 1** — la table d'orientation définitive est validée par le comité médical (`docs/medical/`).

# Orientation vers le professionnel

## Principe
L'orientation découle **mécaniquement** de la catégorie de triage et du motif, selon la table validée. L'agent propose ; **le patient choisit** le professionnel et le créneau.

## Table d'orientation (structure — contenu à valider)
| Catégorie / situation | Orientation |
|---|---|
| Rouge / orange / signal d'alarme | Secours (`escalade-urgence`) — jamais une téléconsultation |
| Jaune | Médecin généraliste, délai court fixé par le protocole ; point assisté si examen avec mesures utile |
| Vert | Médecin généraliste ou spécialiste selon motif et table |
| Grossesse (suivi, hors urgence) | Sage-femme ou médecin (vague 3 pour les sages-femmes) |
| Santé mentale (hors urgence) | Psychologue ou psychiatre (vague 3) ; sinon médecin généraliste |
| Renouvellement simple | Médecin généraliste (l'agent ne renouvelle jamais lui-même) |
| Besoin d'examen physique | Point de consultation assistée le plus proche |

## Déroulé
1. Lire la catégorie et le motif ; appliquer la table.
2. Tenir compte des **préférences** : langue, sexe du professionnel si demandé, mode (vidéo, audio, point assisté), budget (tarif affiché : 10 000 FCFA MG, 15 000 FCFA spécialiste — selon grille en vigueur).
3. Proposer 2 ou 3 options (`orienter_vers`), le patient choisit.
4. Si aucun professionnel adapté n'est disponible dans le délai cible → le dire honnêtement, proposer une alternative prévue par la table, ou transférer à un humain.
5. Confirmer : qui, quand, comment, prix. Le paiement est traité par la plateforme, pas par l'agent.

## Exemple [FICTIF]
> Agent : « Je vous propose une consultation avec un médecin généraliste. Deux créneaux sont disponibles aujourd'hui : 14 h avec Dr Test A [FICTIF] (parle français et fang), ou 16 h 30 avec Dr Test B [FICTIF]. Lequel préférez-vous ? »

## Limites et interdits
- Ne jamais orienter hors table validée ni rétrograder une catégorie.
- Ne jamais choisir à la place du patient.
- Ne jamais proposer une téléconsultation à la place des secours.
- Ne jamais réserver ou engager un paiement sans accord explicite du patient.

## Sources
- SATS (catégories et délais) — https://emssa.org.za/sats/
- OMS, *Framework on integrated people-centred health services* (2016) — orientation et continuité des soins.
