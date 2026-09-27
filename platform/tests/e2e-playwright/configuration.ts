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
  'consentement.proche': ['patient-fictif-01'],
  'teleconsultation.video': ['patient-fictif-01', 'medecin-fictif-01'],
  'identite.photos': ['patient-fictif-01', 'patient-fictif-03'],
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
    | 'verification-identite';
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
