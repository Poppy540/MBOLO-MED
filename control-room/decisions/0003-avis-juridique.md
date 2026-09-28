# D-0003 — Conclusions de l'avis juridique (téléconsultation au Gabon)

- **Date :** _à compléter_
- **Décideur :** porteur de projet, sur avis écrit du juriste
- **Fiche(s) liée(s) :** —
- **Statut :** **brouillon à compléter** — préparé par l'Agent 6 le 2026-09-28 ; ne vaut décision qu'une fois rempli et daté par le porteur de projet

> Mode d'emploi : pour chaque question, reporter la **réponse du juriste** (avec la référence du texte de loi ou de la décision) et la **conséquence retenue**. Laisser « non tranché » plutôt que deviner. Aucun nom de personne ni de patient dans ce fichier : le nom du cabinet et l'avis signé restent hors du dépôt, dans le coffre documentaire du porteur de projet.

## Décision
_À rédiger en une ou deux phrases une fois les réponses reportées. Exemple de forme [FICTIF] : « Les données de santé peuvent être hébergées en France chez un hébergeur certifié HDS ; la réserve de l'ADR-0004 est levée. Les médecins exerçant à l'étranger doivent être inscrits à l'Ordre du Gabon avant toute consultation. »_

## Réponses du juriste

| # | Question (`memory.md` §3) | Réponse du juriste | Texte de référence | Conséquence retenue | Documents touchés |
|---|---|---|---|---|---|
| 1 | La téléconsultation est-elle encadrée au Gabon (autorisation, conditions) ? | | | | `vagues.md` (critère 1) |
| 2 | Un médecin inscrit à l'étranger peut-il téléconsulter un patient au Gabon (inscription à l'Ordre du Gabon, autorisation ministérielle) ? | | | | recrutement (Agent 3), `equipe-pluridisciplinaire.md` |
| 3 | Les données de santé doivent-elles être hébergées au Gabon ? Une certification est-elle exigée (équivalent HDS) ? | | | | **ADR-0004** (réserve), ADR-0016 (KMS) |
| 4 | Autorité compétente (CNPDCP, loi n°001/2011) : déclaration ou autorisation préalable pour un traitement de données de santé ? Délai ? | | | | registre des traitements, AIPD |
| 5 | Transfert de données vers l'Europe (hébergement, professionnels, diaspora) : conditions ; application du RGPD | | | | registre, AIPD, ADR-0004 |
| 6 | Ordonnances électroniques : valables en pharmacie au Gabon ? Et signées par un médecin exerçant à l'étranger ? | | | | vague 2 (Agent 2) |
| 7 | Signature électronique : quel niveau est reconnu (compte-rendu, ordonnance) ? | | | | service `consultation`, vague 2 |
| 8 | Identification des patients : les photos du document et du visage sont-elles permises ? Base légale, durée de conservation, cas des mineurs (ADR-0014, ADR-0015) | | | | charte `C-IDENTITE`, AIPD n°1, flag `identite.photos` |
| 9 | Consentement des proches et de la diaspora pour accéder au dossier (C-PROCHE) | | | | flag `consentement.proche` |
| 10 | Paiement mobile money : contraintes pour une plateforme de santé (agrément, facturation, fiscalité, remboursements) | | | | ADR-0017 |
| 11 | Pharmacovigilance : circuit national de déclaration et interlocuteur | | | | vague 2 |
| 12 | Responsabilité en cas d'incident (médecin, plateforme, hébergeur) ; assurance professionnelle exigée | | | | contrats, recrutement |

## Raisons
_Résumé des arguments du juriste utiles aux décisions suivantes._

## Conséquences et actions

| Action | Responsable (rôle) | Échéance |
|---|---|---|
| Lever ou maintenir la réserve de l'ADR-0004 selon la réponse n°3 | Porteur de projet | |
| Mettre à jour le registre des traitements et les AIPD selon les réponses 4, 5 et 8 | Porteur de projet (Agent 6 prépare) | |
| Adapter la charte `C-IDENTITE` selon la réponse n°8 | Porteur de projet + juriste | |
| Mettre à jour les critères de passage (`control-room/passages-de-vague/`) | Agent 6 | |
| Engager les formalités auprès de l'autorité compétente (réponse n°4) | Porteur de projet | |

## Mise à jour de `memory.md`
- [ ] Ligne ajoutée dans « Décisions validées »
- [ ] Hypothèses du §3 confirmées ou infirmées
- [ ] Question n°1 du §4 close
