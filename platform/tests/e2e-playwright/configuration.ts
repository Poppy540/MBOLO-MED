// Paramètres communs des tests de bout en bout. Comptes FICTIFS uniquement.
// Les mots de passe sont tirés au hasard à chaque exécution (preparation-globale.ts), jamais écrits sur disque.

export const KEYCLOAK_URL = process.env['KEYCLOAK_URL'] ?? 'http://127.0.0.1:8081';
export const ROYAUME = 'mbolo';
export const EMETTEUR = `${KEYCLOAK_URL}/realms/${ROYAUME}`;
export const IDENTITE_URL = process.env['IDENTITE_URL'] ?? 'http://127.0.0.1:3001';
/** Serveur FHIR interne (HAPI) : seuls la passerelle et la préparation des tests y accèdent. */
export const FHIR_URL = process.env['FHIR_AMONT_URL'] ?? 'http://127.0.0.1:8080/fhir';
/** Passerelle du dossier : seul point d'entrée des services vers le dossier. */
export const PASSERELLE_URL = process.env['PASSERELLE_URL'] ?? 'http://127.0.0.1:3002';
export const CLIENT_SERVICE_IDENTITE = 'mbolo-identite-service';
export const CLIENT_SERVICE_TELECONSULTATION = 'mbolo-teleconsultation-service';
export const CLIENT_SERVICE_NOTIFICATIONS = 'mbolo-notifications-service';
/** Service de téléconsultation et serveur LiveKit de test (ADR-0011). */
export const TELECONSULTATION_URL = process.env['TELECONSULTATION_URL'] ?? 'http://127.0.0.1:3003';
export const NOTIFICATIONS_URL = process.env['NOTIFICATIONS_URL'] ?? 'http://127.0.0.1:3004';
export const CONSULTATION_URL = process.env['CONSULTATION_URL'] ?? 'http://127.0.0.1:3005';
/** Service des invitations (ADR-0013) et sa base PostgreSQL de test. */
export const INVITATIONS_URL = process.env['INVITATIONS_URL'] ?? 'http://127.0.0.1:3006';
/** Service documents (ADR-0015) : photos d'identité chiffrées, base PostgreSQL et S3 de test. */
export const DOCUMENTS_URL = process.env['DOCUMENTS_URL'] ?? 'http://127.0.0.1:3007';
/** Service de paiement (ADR-0017) : fournisseur simulé, base PostgreSQL de test. */
export const PAIEMENT_URL = process.env['PAIEMENT_URL'] ?? 'http://127.0.0.1:3008';
/** [FICTIF] Cohorte ouverte par le déploiement de test. */
export const COHORTE_TEST = 'ville-fictive';
/** [FICTIF] Préfixe des comptes créés par les scénarios d'inscription (retirés à la préparation). */
export const PREFIXE_INSCRITS = 'inscrit-fictif-';
/**
 * Applications (vite preview). Les ports 5173 et 5174 restent les faux retours de connexion des
 * étapes de test (clients patient et professionnel) : une vraie application y consommerait leurs codes.
 */
export const APP_PATIENT_URL = process.env['APP_PATIENT_URL'] ?? 'http://localhost:5180';
export const APP_PRO_URL = process.env['APP_PRO_URL'] ?? 'http://localhost:5181';
export const WEBRTC_URL = process.env['WEBRTC_SERVER_URL'] ?? 'ws://127.0.0.1:7880';
/** Unleash de test (feature flags, ADR-0007). */
export const UNLEASH_URL = process.env['UNLEASH_API_URL'] ?? 'http://127.0.0.1:4242/api';
/** [FICTIF] Cohortes de test par flag (ciblage Unleash par compte) ; les autres comptes : désactivé. */
export const COHORTES: Record<string, string[]> = {
  // Le proche est aussi dans la cohorte : documents.proche dépend de consentement.proche.
  'consentement.proche': ['patient-fictif-01', 'proche-fictif-01'],
  'documents.proche': ['proche-fictif-01'],
  'teleconsultation.video': ['patient-fictif-01', 'medecin-fictif-01', 'patient-fictif-04'],
  // Téléphone perdu (ADR-0023) : patient-fictif-06 envoie de nouvelles photos.
  'identite.photos': ['patient-fictif-01', 'patient-fictif-03', 'patient-fictif-06'],
  // Réservation payante (ADR-0017) : un seul patient, les autres réservent sans paiement.
  // Le compte des relevés y est aussi : reversements.professionnels dépend de ce flag.
  'paiement.mobile-money': ['patient-fictif-04', 'reversements-fictif-01'],
  // Reçus et avoirs (ADR-0020) : dépendent du paiement, même cohorte.
  'facturation.recus': ['patient-fictif-04'],
  // Relevés des professionnels (ADR-0020) : le seul compte habilité de test.
  'reversements.professionnels': ['reversements-fictif-01'],
  // Ordonnances électroniques (ADR-0018) : un seul médecin, l'infirmier n'en fait pas partie.
  'ordonnances.electroniques': ['medecin-fictif-01'],
  // Récupération du compte (ADR-0021) : le flag est évalué pour le membre de l'équipe.
  'compte.recuperation': ['assistant-fictif-01'],
};

/** Applications clientes du royaume (realm-mbolo.json) : publiques, PKCE S256 obligatoire. */
export const APPLICATIONS = {
  patient: { clientId: 'mbolo-app-patient', redirection: 'http://localhost:5173/connexion' },
  pro: { clientId: 'mbolo-app-pro', redirection: 'http://localhost:5174/connexion' },
} as const;

export interface CompteFictif {
  identifiant: string;
  prenom: string;
  role:
    | 'patient'
    | 'proche'
    | 'professionnel'
    | 'infirmier'
    | 'pharmacien'
    | 'revue-acces'
    | 'gestion-invitations'
    | 'verification-identite'
    | 'validation-remboursement'
    | 'assistance-patient'
    | 'validation-reversement';
  application: keyof typeof APPLICATIONS;
  attributs: Record<string, string>;
}

/** [FICTIF] Comptes de test : noms et identifiants manifestement inventés. */
export const COMPTES: CompteFictif[] = [
  {
    identifiant: 'patient-fictif-01',
    prenom: 'Awa',
    role: 'patient',
    application: 'patient',
    attributs: { patient_id: 'pat-fictif-001' },
  },
  {
    identifiant: 'patient-fictif-02',
    prenom: 'Koffi',
    role: 'patient',
    application: 'patient',
    attributs: { patient_id: 'pat-fictif-002' },
  },
  {
    // Identité encore à vérifier (préparation) : parcours « Vérifier mon identité » (ADR-0015).
    identifiant: 'patient-fictif-03',
    prenom: 'Inès',
    role: 'patient',
    application: 'patient',
    attributs: { patient_id: 'pat-fictif-003' },
  },
  {
    // Réservation payante (flag paiement.mobile-money, ADR-0017).
    identifiant: 'patient-fictif-04',
    prenom: 'Paul',
    role: 'patient',
    application: 'patient',
    attributs: { patient_id: 'pat-fictif-004' },
  },
  {
    // Récupération du compte (ADR-0021) : son mot de passe change pendant les scénarios.
    identifiant: 'patient-fictif-05',
    prenom: 'Mireille',
    role: 'patient',
    application: 'patient',
    attributs: { patient_id: 'pat-fictif-005' },
  },
  {
    // Téléphone perdu (ADR-0023) : son numéro change pendant les scénarios (remis à la préparation).
    identifiant: 'patient-fictif-06',
    prenom: 'Serge',
    role: 'patient',
    application: 'patient',
    attributs: { patient_id: 'pat-fictif-006' },
  },
  {
    // Application d'authentification (ADR-0024) : active pendant les scénarios (compte recréé à la
    // préparation, donc revenu au SMS).
    identifiant: 'patient-fictif-07',
    prenom: 'Aimée',
    role: 'patient',
    application: 'patient',
    attributs: { patient_id: 'pat-fictif-007' },
  },
  {
    identifiant: 'medecin-fictif-01',
    prenom: 'Nadia',
    role: 'professionnel',
    application: 'pro',
    attributs: { practitioner_id: 'prac-fictif-001' },
  },
  {
    identifiant: 'proche-fictif-01',
    prenom: 'Serge',
    role: 'proche',
    application: 'patient',
    attributs: { related_person_id: 'rp-fictif-001' },
  },
  {
    identifiant: 'infirmier-fictif-01',
    prenom: 'Marc',
    role: 'infirmier',
    application: 'pro',
    attributs: { practitioner_id: 'prac-fictif-002' },
  },
  {
    identifiant: 'relecteur-fictif-01',
    prenom: 'Claire',
    role: 'revue-acces',
    application: 'pro',
    attributs: {},
  },
  {
    identifiant: 'gestionnaire-fictif-01',
    prenom: 'Joël',
    role: 'gestion-invitations',
    application: 'pro',
    attributs: {},
  },
  {
    identifiant: 'verificateur-fictif-01',
    prenom: 'Amina',
    role: 'verification-identite',
    application: 'pro',
    attributs: {},
  },
  {
    // Valide ou refuse les remboursements préparés par la plateforme (ADR-0017).
    identifiant: 'valideur-fictif-01',
    prenom: 'Rose',
    role: 'validation-remboursement',
    application: 'pro',
    attributs: {},
  },
  {
    // Relit les relevés mensuels des professionnels (ADR-0020) ; distinct du valideur des remboursements.
    identifiant: 'reversements-fictif-01',
    prenom: 'Honoré',
    role: 'validation-reversement',
    application: 'pro',
    attributs: {},
  },
  {
    // Retire les proches d'un patient à sa demande, après l'avoir rappelé (ADR-0019).
    identifiant: 'assistant-fictif-01',
    prenom: 'Blaise',
    role: 'assistance-patient',
    application: 'pro',
    attributs: {},
  },
  {
    identifiant: 'pharmacien-fictif-01',
    prenom: 'Léa',
    role: 'pharmacien',
    application: 'pro',
    attributs: {},
  },
];

/** [FICTIF] Ressources du dossier référencées par les comptes (créées dans le serveur FHIR de test). */
export const RESSOURCES_FHIR = [
  ...COMPTES.flatMap((c) =>
    Object.entries(c.attributs).map(([attribut, id]) => ({
      type: {
        patient_id: 'Patient',
        practitioner_id: 'Practitioner',
        related_person_id: 'RelatedPerson',
      }[attribut] as 'Patient' | 'Practitioner' | 'RelatedPerson',
      id,
    })),
  ),
];

/**
 * [FICTIF] Numéro du dossier de chaque patient (préparation) : ceux dont les SMS ne doivent pas se
 * mêler aux autres ont leur propre numéro ; les autres partagent +241 00 00 00 01.
 */
export const TELEPHONES_FICTIFS: Record<string, string> = {
  'pat-fictif-004': '+241 00 00 00 04',
  'pat-fictif-005': '+241 00 00 00 05',
  'pat-fictif-006': '+241 00 00 00 06',
  'pat-fictif-007': '+241 00 00 00 07',
};

/** [FICTIF] Patients dont l'identité reste « à vérifier » après la préparation. */
export const PATIENTS_A_VERIFIER = ['pat-fictif-003'];

export const VARIABLE_MOTS_DE_PASSE = 'MBOLO_E2E_MOTS_DE_PASSE';

export function compte(identifiant: string): CompteFictif {
  const c = COMPTES.find((x) => x.identifiant === identifiant);
  if (!c) throw new Error(`Compte fictif inconnu : ${identifiant}`);
  return c;
}

export function motDePasse(identifiant: string): string {
  const tous = JSON.parse(process.env[VARIABLE_MOTS_DE_PASSE] ?? '{}') as Record<string, string>;
  const mdp = tous[identifiant];
  if (!mdp) throw new Error(`Mot de passe non préparé pour ${identifiant}`);
  return mdp;
}
