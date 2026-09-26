# Mémoire du projet — Mbolo Santé

> Lue à chaque session. **Moins de 200 lignes. Aucun secret, aucune donnée personnelle.** Les détails vont dans `docs/`.
> Dernière mise à jour : 2026-09-26.

## 1. État actuel

- **Vague en cours : 0 (fondations).** Aucun patient réel, aucune donnée réelle.
- **Fait :**
  - Étape 2 — sécurité : `.gitignore`, pre-commit + gitleaks, `.claude/settings.json`, `secrets/` (inventaire sans valeurs, 16 modèles `CHANGEME`).
  - Étape 3 — référence : `CLAUDE.md`, `memory.md`, `README.md`, `docs/deploiement/vagues.md`, squelettes de `docs/`.
  - Étape 4 — agents 1 à 5 : `CLAUDE.md`, `system-prompt.md`, `permissions.md`, 45 skills + `garde-fous-communs` (`agents/_commun/`), cas de test (option C).
  - Étape 5 — salle de contrôle : 7 sous-agents (`.claude/agents/`), 42 skills (`.claude/skills/`, dont 20 complets), modèles de fiche, brief, rapport, revue, décision ; registre des risques initial (12 risques).
  - Étape 6 — squelette `platform/` (apps, services, tests) + `platform/CLAUDE.md` ; aucun code applicatif.
  - Étape 7 — contrôle final : gitleaks (fichiers + historique) sans fuite ; hooks pre-commit au vert ; aucune clé Claude, aucun téléphone ou e-mail réel ; 88 skills conformes (frontmatter, exemples fictifs, limites, sources) ; principes repris mot pour mot.
- **Bilan des skills :** 88 (46 plateforme dont `garde-fous-communs`, 42 salle de contrôle) — 24 `complet`, 64 `v1`. Chaque agent a des cas de refus ou d'escalade.
- **Prochaine étape proposée :** lever les blocages juridiques et humains de la vague 0 (voir §3 et §4), puis démarrer `platform/services/identite` et `dossier-fhir` sur données fictives.

## 2. Décisions validées

| Date | Décision | Référence |
|---|---|---|
| 2026-09-26 | Téléconsultation Gabon d'abord, professionnels du monde entier ; besoin considéré comme validé | [D-0001](control-room/decisions/0001-decisions-initiales.md) |
| 2026-09-26 | Plateforme construite complète, activée par vagues et feature flags (ville, spécialité, type d'utilisateur) | D-0001, [vagues](docs/deploiement/vagues.md) |
| 2026-09-26 | Modèle hybride : smartphone + points de consultation assistée (infirmier + objets connectés) | D-0001 |
| 2026-09-26 | Équipe pluridisciplinaire ; pharmacies locales (ordonnances électroniques, génériques) ; Académie Mbolo | D-0001 |
| 2026-09-26 | Conception pour faible débit par défaut, repli audio, hors ligne ; vocal et pictogrammes ; français puis langues locales | D-0001 |
| 2026-09-26 | Paiement : mobile money (Airtel, Moov) localement, carte pour la diaspora | D-0001 |
| 2026-09-26 | Complément d'eGabon-SIS, jamais concurrent ; interopérabilité prévue | D-0001 |
| 2026-09-26 | Convention CNAMGS visée en vague 4 | D-0001 |
| 2026-09-26 | Hypothèses économiques : MG 10 000 FCFA, spécialisée 15 000 FCFA, Diaspora Famille 25 €/mois, pharmacie 50 000 FCFA/mois, 55 % reversés au professionnel ; rentabilité année 3 ; le tableur fait foi | D-0001, [business plan](docs/business-plan/README.md) |
| 2026-09-26 | Dossier médical HL7 FHIR, serveur open source (ex. HAPI FHIR) | [ADR-0001](docs/architecture/adr/0001-fhir.md) |
| 2026-09-26 | Vidéo WebRTC adaptée au faible débit (ex. LiveKit ou Jitsi) | [ADR-0002](docs/architecture/adr/0002-webrtc-faible-debit.md) |
| 2026-09-26 | Déploiement progressif par feature flags | [ADR-0003](docs/architecture/adr/0003-feature-flags.md) |
| 2026-09-26 | Tests automatisés Gherkin + Playwright | D-0001 |
| 2026-09-26 | Six agents IA, aucun ne pose de diagnostic ni ne prescrit ; Agent 6 démarre aux niveaux d'autonomie 1 à 3 | D-0001 |
| 2026-09-26 | Secrets : inventaire sans valeurs dans `secrets/`, valeurs dans un coffre-fort ; clé API Claude exclue de l'inventaire | D-0001 |
| 2026-09-26 | Cas de test « option C » : 3 cas pour skills vague 0 et cliniques, 1 cas pour les skills V1 ; 3 cas obligatoires avant activation | D-0001 |
| 2026-09-26 | Skills ajoutés : `garde-fous-communs`, `interoperabilite-egabon-sis`, `pseudonymisation-donnees`, `coordination-interpretes` | D-0001 |
| 2026-09-26 | Nom d'usage « Mbolo Santé » (dépôt `MBOLO-MED`) | D-0001 |
| 2026-09-26 | Hébergement : OVHcloud HDS (France), **sous réserve de l'avis juridique** sur la localisation au Gabon | [D-0002](control-room/decisions/0002-choix-outils-infrastructure.md), [ADR-0004](docs/architecture/adr/0004-hebergement-donnees-sante.md) |
| 2026-09-26 | Coffre-fort : Infisical (UE, puis auto-hébergé) | D-0002, [ADR-0005](docs/architecture/adr/0005-coffre-fort-secrets.md) |
| 2026-09-26 | Messagerie salle de contrôle : Slack + astreinte Grafana OnCall (appel / SMS) | D-0002, [ADR-0006](docs/architecture/adr/0006-messagerie-salle-de-controle.md) |
| 2026-09-26 | Feature flags : Unleash via OpenFeature | D-0002, [ADR-0007](docs/architecture/adr/0007-feature-flags-unleash.md) |

## 3. Hypothèses en attente de confirmation

- **Cadre légal** de la téléconsultation au Gabon, notamment par un médecin inscrit à l'étranger (inscription à l'Ordre des médecins du Gabon requise ? autorisation ministérielle ?).
- **Standard d'eGabon-SIS** (FHIR ? DHIS2 ? OpenMRS ?) et conditions d'interopérabilité.
- **Validité des ordonnances** électroniques et des ordonnances signées par un médecin étranger en pharmacie gabonaise.
- **Hébergement des données de santé** : obligation de localisation au Gabon ? Certification exigée ? (équivalent HDS ?)
- **Autorité de protection des données** compétente (CNPDCP, loi n°001/2011) et formalités préalables pour un traitement de données de santé.
- **Cadre de la signature électronique** et de l'identification des patients (pièce d'identité, numéro CNAMGS ?).
- **Pharmacovigilance** : circuit national de déclaration et interlocuteur.
- **Contenu des vagues 1 à 3** tel que proposé dans `docs/deploiement/vagues.md`.

## 4. Questions ouvertes pour le porteur de projet

1. **Avis juridique** sur la localisation des données de santé (condition de l'ADR-0004) ; devis et contrat HDS à vérifier avant engagement.
2. Qui compose le **comité médical**, qui est **directeur médical de garde**, qui est **responsable sécurité** ?
3. Liste fermée des **actions de niveau 4** autorisées à l'Agent 6 ?
4. Valider le **contenu des vagues** et fixer les seuils chiffrés des critères de passage.
5. Ajouter le tableur `docs/business-plan/Mbolo_Sante_Business_Plan.xlsx`.
6. Activer la **protection de branche** GitHub sur `main` (l'accès GitHub de Claude est rétabli).

## 5. Leçons apprises

- 2026-09-26 — Vérifier l'existence d'un dossier avant d'y écrire en série (un `cd` échoué a interrompu une création de fichiers ; rien n'a été écrit au mauvais endroit).
- 2026-09-26 — gitleaks utilise le moteur RE2 : pas de lookahead dans les règles ; exclure les valeurs factices par l'allowlist.
