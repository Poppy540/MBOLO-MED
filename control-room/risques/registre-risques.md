# Registre des risques — Mbolo Santé

> Tenu par `pilote-projet` (skill `registre-risques`). Revu chaque semaine ; chaque évolution est tracée dans le journal en bas de page.
> **Probabilité (P)** et **Impact (I)** notés de 1 (faible) à 5 (très fort) ; **Criticité = P × I** (≥ 15 : critique · 8–14 : élevée · 4–7 : moyenne · ≤ 3 : faible).
> Responsable = rôle (à nommer). Aucune donnée personnelle.

| ID | Risque | Catégorie | P | I | Criticité | Signaux d'alerte | Mesures (prévention / atténuation) | Responsable | Échéance | Statut |
|---|---|---|---|---|---|---|---|---|---|---|
| R-01 | **Cadre légal** de la téléconsultation au Gabon incertain, notamment pour les médecins exerçant depuis l'étranger | Juridique | 4 | 5 | **20** | Absence de texte ; réponse négative de l'Ordre ou du ministère | Consultation d'un juriste gabonais ; échanges avec l'Ordre des médecins et le ministère ; option « médecins inscrits au Gabon » en vague 1 | Porteur de projet | Avant vague 1 | Ouvert |
| R-02 | **Validité des ordonnances** électroniques et des ordonnances signées par un médecin étranger en pharmacie | Juridique / Médical | 4 | 4 | **16** | Refus de délivrance par des pharmacies ; avis de l'Ordre des pharmaciens | Avis juridique ; pilote avec pharmacies partenaires ; circuit de contre-signature par un médecin inscrit au Gabon si nécessaire | Resp. pharmacies | Avant vague 2 | Ouvert |
| R-03 | **Hébergement des données de santé** : exigences de localisation ou de certification inconnues ; choix d'hébergeur non fait | Conformité / Technique | 3 | 5 | **15** | Texte ou exigence nouvelle ; coût d'hébergement local élevé | Analyse juridique ; hébergeur retenu sous réserve : OVHcloud HDS (ADR-0004) ; architecture portable (conteneurs, FHIR standard) ; AIPD ; chiffrement et clés maîtrisées | Resp. sécurité | Avant vague 1 | Ouvert |
| R-04 | **Connectivité en province** insuffisante pour la vidéo | Technique / Accès | 5 | 3 | **15** | Taux d'échec de consultation > seuil hors Libreville | Faible débit par défaut, repli audio, puis téléphone ; points de consultation assistée ; mode hors ligne ; tests terrain | Resp. technique | Vague 1 puis 3 | Ouvert |
| R-05 | **Volume insuffisant** de consultations (adoption, confiance, prix) empêchant d'atteindre le point mort (~75 % du volume prévu en année 3) | Économique | 3 | 5 | **15** | Consultations < 50 % du prévisionnel pendant 2 mois ; faible taux de réutilisation | Suivi mensuel réel vs tableur ; partenariats pharmacies ; offre Diaspora ; offres entreprises ; ajustement des prix sur décision | Porteur de projet | Continu | Ouvert |
| R-06 | **Dépendance à un seul humain** (porteur de projet, et rôles clés non encore pourvus : directeur médical, responsable sécurité) | Organisation | 4 | 4 | **16** | Décisions en attente > délai ; indisponibilité | Nommer les rôles clés et leurs suppléants ; documentation (`memory.md`, décisions) ; astreintes ; délégations écrites | Porteur de projet | Avant vague 1 | Ouvert |
| R-07 | **Erreur d'orientation d'une urgence** par l'Agent 1 (signal manqué, transcription vocale erronée) | Sécurité patient | 2 | 5 | **10** | Écart « signal manqué » détecté par l'Agent 4 | Liste de signaux validée ; escalade au moindre doute ; cas de test ; audit 100 % des escalades ; astreinte médicale | Directeur médical | Avant vague 1 | Ouvert |
| R-08 | **Injection de prompt** ou détournement d'un agent IA | Sécurité | 3 | 4 | **12** | Incidents `injection_prompt` ; comportement hors périmètre | `garde-fous-communs` ; outils à portée minimale ; OWASP LLM Top 10 ; tests de robustesse | Resp. sécurité | Continu | Ouvert |
| R-09 | **Fuite de données de santé** ou de secrets | Sécurité / Conformité | 2 | 5 | **10** | Alerte gitleaks ; accès anormal ; alerte hébergeur | Coffre-fort ; gitleaks ; chiffrement ; journalisation ; plan d'incident testé | Resp. sécurité | Continu | Ouvert |
| R-10 | **Faux professionnel** ou professionnel non autorisé | Sécurité patient | 2 | 5 | **10** | Divergence registre ; plainte | Vérification humaine systématique ; revérification périodique | Resp. recrutement | Avant vague 1 | Ouvert |
| R-11 | **Relation avec eGabon-SIS** perçue comme concurrente ; interopérabilité impossible | Institutionnel | 2 | 4 | **8** | Absence de dialogue ; standard incompatible | Positionnement complémentaire explicite ; FHIR ; contact institutionnel par le porteur de projet | Porteur de projet | Vague 1–4 | Ouvert |
| R-12 | **Panne ou vol du matériel** des points de consultation assistée | Exploitation | 3 | 3 | **9** | Mesures incohérentes ; appareil hors ligne | Maintenance préventive ; étalonnage ; stock de remplacement ; inventaire | Resp. exploitation | Vague 2 | Ouvert |

## Journal
| Date | Modification | Par |
|---|---|---|
| 2026-09-26 | Création : 6 risques connus (R-01 à R-06) + 6 risques identifiés lors de l'initialisation (R-07 à R-12) | Initialisation (Claude Code) — à valider par le porteur de projet |
| 2026-09-26 | R-03 : mesure ajoutée (hébergeur retenu sous réserve, D-0002) | Claude Code sur demande du porteur de projet |
