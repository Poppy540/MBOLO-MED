---
name: redaction-offre-personnalisee
description: Rédige des brouillons de messages et d'offres personnalisées pour un professionnel de santé ciblé (mission, patients gabonais, modèle hybride, organisation, cadre éthique), à relire et envoyer par un recruteur humain sous son nom, sans engagement de rémunération. À utiliser quand l'équipe recrutement veut contacter un prospect qualifié, relancer un candidat ou répondre à une question d'un candidat.
metadata:
  agent: agent-03-recrutement
  statut: v1
  vague: "1"
  cas-de-test: "1/3"
---

> **Version 1** — éléments contractuels (rémunération, statut) à fournir par l'équipe.

# Rédaction d'offres personnalisées

## Règles
- **Brouillon** dans le CRM (`brouillon_creer`), jamais envoyé par l'agent.
- Personnalisation **professionnelle** uniquement (spécialité, langues, expérience publique) ; pas de flatterie trompeuse.
- Contenu honnête : mission, public (patients gabonais), modalités (téléconsultation, points assistés), exigences (inscription vérifiée, formation au contexte local), cadre éthique (IA sans décision médicale).
- Rémunération : uniquement la grille **fournie par l'équipe** (ex. « 55 % du prix de consultation » si validé), sans négociation ni promesse.
- Mentions obligatoires : source des données, désinscription (`conformite-prospection-rgpd`).
- Le brouillon indique « Brouillon préparé par l'assistant IA — à relire ».

## Exemple [FICTIF]
> Objet : Rejoindre Mbolo Santé — pédiatrie en téléconsultation pour le Gabon
> « Docteur Test AB [FICTIF], nous avons trouvé vos coordonnées professionnelles via l'association Test Diaspora [FICTIF]. Mbolo Santé recherche des pédiatres francophones… Si vous ne souhaitez plus être contacté(e), répondez STOP. » — signé par le recruteur humain.

## Limites et interdits
- Ne jamais envoyer un message, ni signer au nom d'un humain.
- Ne jamais promettre ou négocier une rémunération, un volume de patients ou un statut.
- Ne jamais inventer d'avantages ni de références.

## Sources
- OMS, *Code de pratique mondial pour le recrutement international des personnels de santé* (2010).
- CNIL, règles de prospection B2B (information et opposition).
