# Registre des traitements — Mbolo Santé

> Squelette. Tenu par le responsable sécurité / DPO, avec l'appui du skill `conformite-donnees-sante`. Base : loi gabonaise n°001/2011 (à confirmer par un juriste) et RGPD art. 30.

| # | Traitement | Finalité | Base légale | Catégories de données | Personnes concernées | Destinataires | Transferts hors Gabon | Durée de conservation | Mesures de sécurité |
|---|---|---|---|---|---|---|---|---|---|
| T1 | Accueil et orientation (Agent 1) | Préparer la consultation | Consentement explicite (données de santé) — à confirmer | Identité, santé | Patients | Professionnel choisi | À déterminer (hébergement) | À déterminer | Chiffrement, journalisation |
| T2 | Téléconsultation | Soins | À confirmer | Santé, vidéo (non enregistrée par défaut) | Patients, professionnels | Professionnel | Oui si professionnel à l'étranger | À déterminer | WebRTC chiffré |
| T3 | Ordonnances et pharmacie (Agent 2) | Délivrance, suivi | À confirmer | Santé, traitements | Patients | Pharmacie choisie | Non | À déterminer | Signature, contrôle d'accès |
| T4 | Paiement | Facturation | Contrat | Transactions | Patients, diaspora | Prestataires de paiement | Oui (carte) | Obligations comptables | Aucun stockage de numéro de carte |
| T5 | Recrutement (Agent 3) | Recruter des professionnels | Intérêt légitime — à confirmer | Données professionnelles | Prospects | Équipe recrutement | Oui | Durée légale de prospection | Désinscription possible |
| T6 | Audit qualité (Agent 4) | Qualité et sécurité des soins | À confirmer | Conversations pseudonymisées | Patients | Direction médicale | Non | À déterminer | Pseudonymisation |
| T7 | Académie (Agent 5) | Formation | Consentement / contrat | Données pédagogiques ; cas anonymisés | Étudiants, mentors | Mentors | Possible | À déterminer | Anonymisation validée |
| T8 | Accès sur invitation (ADR-0013) | Limiter l'ouverture de la vague 1 à une population définie | Intérêt légitime (déploiement progressif et sûr) — à confirmer | Empreinte du code (jamais le code), cohorte, identifiants de compte opaques, dates ; aucune donnée de santé | Patients invités, gestionnaires des invitations | Gestionnaires habilités (rôle `gestion-invitations`) | Selon l'hébergement (ADR-0004) | À déterminer (proposé : fin de la vague + 1 an) | Empreinte HMAC, rôle d'exécution sans suppression, double authentification, essais limités, journal sans code |
