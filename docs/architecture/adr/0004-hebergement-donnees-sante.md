# ADR-0004 — Hébergement des données de santé

- **Date :** 2026-09-26
- **Statut :** acceptée **sous réserve de l'avis juridique** (D-0002)
- **Décideurs :** porteur de projet

## Contexte
Les données de santé doivent être hébergées de façon sécurisée et conforme. L'existence d'une obligation de localisation au Gabon n'est pas encore connue (risque R-03). Une partie des utilisateurs relève du RGPD (diaspora, professionnels en Europe).

## Options envisagées
1. **OVHcloud, offre HDS, France** — certification Hébergeur de Données de Santé ; opérateur européen (hors Cloud Act) ; services gérés (Kubernetes, PostgreSQL, stockage objet, gestion de clés) ; coûts généralement modérés.
2. **AWS / Azure, régions françaises certifiées HDS** — catalogue plus large ; plus coûteux et plus complexe ; soumis au droit américain.
3. **Hébergeur au Gabon** — nécessaire si la loi impose la localisation ; offres certifiées et services gérés à évaluer.

## Décision
Option 1, **sous réserve** que le juriste confirme l'absence d'obligation de localisation au Gabon. Si l'obligation existe, bascule vers l'option 3 (ou architecture hybride : données au Gabon, services sans données de santé ailleurs).

## Conséquences
- L'architecture reste **portable** : conteneurs, FHIR standard, infrastructure décrite en code, aucune dépendance à un service propriétaire non remplaçable.
- Le serveur média WebRTC peut être placé indépendamment, après tests terrain de latence.
- Contrat : clauses de non-réutilisation des données, réversibilité, localisation, notification des violations, audit.
- Mise à jour du registre des traitements et de l'AIPD (sous-traitant, transferts).
- Tarifs et contrats à vérifier avant engagement.

Sources : référentiel de certification HDS (Agence du numérique en santé) — https://esante.gouv.fr/produits-services/hds ; OVHcloud, offre santé — https://www.ovhcloud.com/fr/enterprise/certification-conformity/hds/
