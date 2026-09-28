# Comité médical — lettre de mission (brouillon)

> **Brouillon à relire et adapter par le porteur de projet**, préparé par l'Agent 6 le 2026-09-28. Les noms des membres ne figurent jamais dans le dépôt : ils sont consignés dans une décision du porteur de projet, hors dépôt. Ce document ne contient aucun protocole médical ; les protocoles validés iront dans `docs/medical/`, que seul le comité remplit.

## Objet

Le comité médical de Mbolo Santé garantit la **sécurité des patients** et la **qualité des soins** de la plateforme. Il est le seul à valider les contenus médicaux utilisés par la plateforme et par ses agents IA.

Principe fondateur, non négociable : **aucun agent IA ne pose de diagnostic, ne prescrit, ni ne prend de décision médicale.** Les agents collectent, structurent, orientent, coordonnent ou proposent ; la décision médicale appartient toujours à un professionnel de santé humain.

## Composition proposée

| Rôle | Profil | Nombre |
|---|---|---|
| Président du comité | Médecin généraliste exerçant au Gabon | 1 |
| Membres | Médecin urgentiste ; médecin exerçant depuis l'étranger (diaspora) ; pharmacien (dès la vague 2) ; infirmier (dès la vague 2) | 3 à 5 |
| Directeur médical de garde | Médecin joignable 24 h/24 pour les alertes de sécurité patient (roulement possible) | 1 + suppléant |
| Invité permanent, sans voix | Porteur de projet ; responsable sécurité ou DPO pour les sujets de données | — |

Chaque membre déclare ses liens d'intérêts, mis à jour chaque année.

## Missions

### Avant la vague 1 (critère de passage n°4, `docs/deploiement/vagues.md`)
1. **Protocole de triage** (inspiré de la South African Triage Scale), adapté au Gabon.
2. **Liste des signaux d'alarme** et conduite à tenir, y compris l'orientation immédiate vers les secours.
3. **Numéros et circuits d'urgence** vérifiés, ville par ville.
4. **Skills cliniques** de l'Agent 1 et de l'Agent 4 :
   - relire chaque skill ;
   - relire ses cas de test, dont au moins un refus ou une escalade ;
   - signer la validation avant le passage en statut `complet`.
   Skills concernés aujourd'hui : `detection-signaux-alarme`, `escalade-urgence`, `triage-protocole-valide`, `detection-erreurs-triage`, puis les autres skills cliniques de l'Agent 1.
5. **Avis sur l'option d'une vague 1 sans Agent 1** : consultation réservée directement auprès du médecin, sans triage automatisé (bilan de préparation du 2026-09-28).
6. **Critères de recrutement des médecins** : diplômes, inscription à l'Ordre, expérience. La vérification elle-même reste faite par un humain.

### Pendant les vagues
- Revue mensuelle des indicateurs de sécurité patient (Agent 4) : erreurs de triage, délais d'orientation vers les urgences, incidents.
- Instruction des incidents graves et des plaintes médicales, avec le directeur médical de garde.
- Validation de toute nouvelle version d'un protocole : chaque modification est une nouvelle version signée.
- Avis médical sur chaque passage de vague (dossier préparé par l'Agent 6).

## Fonctionnement

- **Réunion** : mensuelle, et extraordinaire sous 48 h après un incident grave.
- **Quorum** : la moitié des membres, dont le président.
- **Décision** : consensus ou, à défaut, majorité ; le président tranche.
- **Traçabilité** : chaque validation indique le protocole ou le skill, sa version, la date et les rôles des signataires. Elle est consignée par le porteur de projet dans `control-room/decisions/`.
- **Indépendance** : le comité peut demander la désactivation immédiate d'une fonction (feature flag) pour raison de sécurité patient. Le porteur de projet l'exécute sans délai.
- **Confidentialité** : les cas discutés sont pseudonymisés (skill `pseudonymisation-donnees`) ; aucune donnée nominative dans les comptes rendus.

## Ce que le comité ne fait pas

- Il ne consulte pas de patients au titre du comité.
- Il ne délègue jamais une validation à un agent IA.
- Il ne valide pas les choix techniques ou commerciaux, mais peut s'y opposer pour raison de sécurité patient.

## À décider par le porteur de projet

- [ ] Composition et désignation des membres (hors dépôt).
- [ ] Rémunération ou bénévolat ; assurance responsabilité civile professionnelle.
- [ ] Calendrier des premières réunions et ordre de priorité des protocoles.
- [ ] Désignation du directeur médical de garde et de son suppléant.

Sources : `CLAUDE.md` (principes n°1, n°2, n°7) ; `docs/medical/README.md` ; `docs/deploiement/vagues.md` ; bilan `control-room/passages-de-vague/vague-1-2026-09-28.md` ; South African Triage Scale — https://emssa.org.za/sats/
