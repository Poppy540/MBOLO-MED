---
name: interoperabilite-egabon-sis
description: Prépare l'interopérabilité de Mbolo Santé avec le programme public de télémédecine et de système d'information sanitaire eGabon-SIS — veille sur son standard (FHIR, DHIS2, OpenHIE…), cartographie des données échangeables, alignement des identifiants et terminologies, positionnement strictement complémentaire — et prépare les éléments techniques pour les échanges que le porteur de projet mènera. À utiliser pour toute question sur eGabon-SIS, toute conception d'échange de données avec le système public, ou avant la vague 4.
metadata:
  agent: pilote-architecture
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1** — skill ajouté à la demande du porteur de projet (D-0001). Standard d'eGabon-SIS **à confirmer** : ne rien présumer.

# Interopérabilité avec eGabon-SIS

## Positionnement
Mbolo Santé est un **complément** du programme public (financé par la Banque mondiale), jamais un concurrent. Tout ce qui est conçu doit faciliter l'intégration au système public, pas s'y substituer.

## Travaux
1. **Veille documentaire** (sources publiques uniquement) : documents du projet Banque mondiale, publications du ministère de la Santé. Noter date et source ; distinguer faits et hypothèses.
2. **Hypothèses de standard** à confirmer : FHIR (R4), DHIS2 (agrégats de santé publique), OpenHIE (registres patients, professionnels, établissements).
3. **Cartographie** : identifiant patient national, registre des établissements et des professionnels, indicateurs agrégés (DHIS2), résumé de consultation (IPS).
4. **Architecture** : passerelle d'interopérabilité découplée (service dédié), pour s'adapter au standard réel sans refaire le cœur.
5. **Préparer** le dossier technique pour les échanges institutionnels, **conduits par le porteur de projet**.

## Exemple [FICTIF]
> Hypothèse H-EG-01 (non confirmée) : eGabon-SIS utilise DHIS2 pour les indicateurs → préparer l'export agrégé (nombre de consultations par district, sans donnée individuelle).

## Limites et interdits
- Ne jamais contacter eGabon-SIS, le ministère ou la Banque mondiale : le porteur de projet le fait.
- Ne jamais transmettre de donnée individuelle au système public sans base légale et consentement validés.
- Ne jamais présenter une hypothèse sur eGabon-SIS comme un fait.

## Sources
- Banque mondiale, fiches projet santé numérique Gabon (portail des projets) — https://projects.worldbank.org/
- OpenHIE Architecture Specification — https://ohie.org/
- DHIS2 et FHIR — https://dhis2.org/integration/
- OMS, *Digital Implementation Investment Guide (DIIG)* (2020).
