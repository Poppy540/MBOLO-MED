# ADR-0005 — Coffre-fort de secrets : Infisical

- **Date :** 2026-09-26
- **Statut :** acceptée (D-0002)

## Contexte
Les valeurs des secrets ne doivent jamais être dans le dépôt (principe n°5). Il faut un coffre avec une identité machine par service ou agent, journal d'audit, rotation, séparation des environnements, adapté à une petite équipe.

## Options envisagées
1. **Infisical** — open source ; offre hébergée en UE puis auto-hébergement possible ; identités machine ; audit ; rotation ; environnements ; intégrations CI (GitHub Actions) et Kubernetes.
2. **OpenBao / HashiCorp Vault** — très complet (secrets dynamiques) mais exploitation exigeante.
3. **Coffre du cloud** (AWS Secrets Manager…) — pertinent seulement si l'hébergeur est ce cloud.

## Décision
Infisical, région UE au démarrage ; auto-hébergement chez l'hébergeur retenu quand l'exploitation le permet.

## Conséquences
- Emplacement des secrets : projet `mbolo-sante`, environnements `dev` / `recette` / `prod`, un dossier par service : `/<service>/<CLE>`.
- **Une identité machine par service et par agent**, avec accès limité à son seul dossier.
- Aucun agent IA ne reçoit de valeur : les outils côté serveur lisent le coffre et injectent les clés.
- Le journal d'audit du coffre est conservé et consultable par le responsable sécurité.
- Migration vers OpenBao possible si des secrets dynamiques deviennent nécessaires.

Sources : Infisical — https://infisical.com/docs ; OWASP Secrets Management Cheat Sheet.
