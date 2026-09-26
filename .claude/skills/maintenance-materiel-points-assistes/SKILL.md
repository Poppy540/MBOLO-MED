---
name: maintenance-materiel-points-assistes
description: Suit le parc d'objets connectés des points de consultation assistée (tensiomètre, oxymètre, thermomètre, stéthoscope et otoscope numériques, glucomètre, tablette) — inventaire, étalonnage et contrôles périodiques, pannes, mises à jour, désinfection, remplacement — et signale les appareils hors tolérance, sans jamais piloter les appareils à distance. À utiliser pour préparer l'ouverture d'un point assisté, chaque semaine pour les échéances, et dès qu'une mesure semble incohérente ou qu'un appareil tombe en panne.
metadata:
  agent: pilote-exploitation
  statut: v1
  vague: "0"
  cas-de-test: "1/3"
---

> **Version 1** — actif en vague 2 ; exigences des fabricants et réglementation des dispositifs médicaux à confirmer.

# Maintenance du matériel des points assistés

## Inventaire (`docs/deploiement/materiel-points-assistes.md`, à créer)
| ID appareil | Type | Modèle | Point | Mise en service | Dernier étalonnage | Prochain contrôle | État |
|---|---|---|---|---|---|---|---|

## Règles
- Appareils **marqués dispositifs médicaux** et validés (normes : ex. ISO 81060-2 pour les tensiomètres, ISO 80601-2-61 pour les oxymètres).
- Contrôles selon le fabricant (proposé : tensiomètre semestriel, glucomètre contrôle qualité selon notice).
- Mesure incohérente signalée par l'infirmier ou détectée → appareil **mis hors service** par l'infirmier, remplacement.
- Mises à jour logicielles testées en recette avant déploiement.
- Stock de remplacement par zone.

## Exemple [FICTIF]
> Point Test Nord [FICTIF] : oxymètre OX-003 étalonnage dépassé de 12 jours → brief + demande de remplacement à l'équipe terrain.

## Limites et interdits
- Ne jamais piloter, reconfigurer ou mettre à jour un appareil à distance.
- Ne jamais interpréter une mesure clinique.

## Sources
- OMS, *Medical equipment maintenance programme overview* (2011) — https://www.who.int/publications/i/item/9789241501538
- ISO 81060-2:2018 ; ISO 80601-2-61:2017.
