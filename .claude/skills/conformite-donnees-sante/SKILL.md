---
name: conformite-donnees-sante
description: Pilote la conformité de Mbolo Santé en matière de données de santé — loi gabonaise n°001/2011 et autorité de protection, RGPD pour les utilisateurs européens (diaspora, professionnels), registre des traitements, AIPD, bases légales et consentements, droits des personnes, durées de conservation, transferts internationaux, sous-traitants et hébergement — en préparant les documents et en signalant les écarts, sans jamais se substituer au juriste ou au DPO. À utiliser pour tout nouveau traitement de données, tout nouveau fournisseur, avant chaque vague, et pour tenir docs/securite/registre-traitements.md et aipd.md.
metadata:
  agent: pilote-securite
  statut: complet
  vague: "0"
  cas-de-test: "3/3"
---

# Conformité des données de santé

> Ce skill prépare et contrôle ; il ne donne pas d'avis juridique définitif. Toute interprétation du droit gabonais est **à confirmer par un juriste**.

## Cadre
- **Gabon** : loi n°001/2011 relative à la protection des données à caractère personnel ; autorité : CNPDCP (formalités préalables — déclaration ou autorisation — pour les données de santé : **à confirmer**). Textes sur la télémédecine, l'exercice médical, l'hébergement : **à identifier**.
- **UE** (utilisateurs situés dans l'UE, ex. diaspora, professionnels) : RGPD — art. 9 (données de santé), 30 (registre), 35 (AIPD), 28 (sous-traitants), 44 s. (transferts), 33-34 (violations).
- **IA** : règlement européen sur l'IA (UE 2024/1689) si offre dans l'UE — transparence (art. 50) ; analyse de classification des agents à mener.

## Livrables tenus
| Livrable | Fichier | Contenu minimum |
|---|---|---|
| Registre des traitements | `docs/securite/registre-traitements.md` | Finalité, base légale, catégories, personnes, destinataires, transferts, durées, mesures |
| AIPD | `docs/securite/aipd.md` | Description, nécessité, risques, mesures, avis, décision — **avant la vague 1** |
| Registre des sous-traitants | `docs/securite/sous-traitants.md` (à créer) | Hébergeur, vidéo, SMS, voix, API d'IA, paiement : contrat, localisation, garanties, non-réutilisation des données |
| Politique de conservation | `docs/securite/conservation.md` (à créer) | Durée par catégorie, purge, archivage |
| Procédure droits des personnes | `docs/securite/droits-personnes.md` (à créer) | Accès, rectification, effacement (limites du dossier médical), opposition, portabilité, délais |

## Contrôles avant tout nouveau traitement ou fournisseur
1. Finalité déterminée ? Base légale identifiée (consentement explicite pour les données de santé, sauf autre base confirmée) ?
2. Données minimales ? Durées définies ?
3. Destinataires et sous-traitants listés, contrat avec clauses de protection, **interdiction de réutiliser les données pour entraîner des modèles** ?
4. Localisation de l'hébergement et transferts hors Gabon / hors UE : encadrés ?
5. Information des personnes et consentements (`recueil-consentement`) prévus ?
6. AIPD à mettre à jour ?
7. Sinon → écart, fiche problématique, bloquant si données de santé.

## Exemple [FICTIF]
> Nouveau fournisseur de transcription vocale [FICTIF] : hébergé hors Afrique et UE, conditions autorisant l'usage des données pour l'amélioration du service → non conforme (réutilisation) → bloquant ; alternatives : option « zero data retention » contractuelle ou autre fournisseur.

## Limites et interdits
- Ne jamais présenter une interprétation juridique comme certaine ; toujours la marquer « à confirmer ».
- Ne jamais contacter l'autorité de protection, un juriste externe ou un fournisseur : préparer, le porteur de projet agit.
- Ne jamais utiliser de données réelles dans les documents de conformité.

## Sources
- Loi gabonaise n°001/2011 du 25 septembre 2011 relative à la protection des données à caractère personnel.
- Convention de l'Union africaine sur la cybersécurité et la protection des données à caractère personnel (Malabo, 2014).
- RGPD (UE 2016/679) ; CEPD, lignes directrices sur l'AIPD (WP248 rév. 01) — https://ec.europa.eu/newsroom/article29/items/611236
- CNIL, *Guide pratique AIPD* et référentiel « traitements de données de santé » — https://www.cnil.fr/fr/sante
- Règlement (UE) 2024/1689 sur l'intelligence artificielle.
