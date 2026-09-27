// Paramètres communs des tests de bout en bout. Comptes FICTIFS uniquement.
// Les mots de passe sont tirés au hasard à chaque exécution (preparation-globale.ts), jamais écrits sur disque.

export const KEYCLOAK_URL = process.env['KEYCLOAK_URL'] ?? 'http://127.0.0.1:8081';
export const ROYAUME = 'mbolo';
export const EMETTEUR = `${KEYCLOAK_URL}/realms/${ROYAUME}`;
export const IDENTITE_URL = process.env['IDENTITE_URL'] ?? 'http://127.0.0.1:3001';

/** Applications clientes du royaume (realm-mbolo.json) : publiques, PKCE S256 obligatoire. */
export const APPLICATIONS = {
  patient: { clientId: 'mbolo-app-patient', redirection: 'http://localhost:5173/connexion' },
  pro: { clientId: 'mbolo-app-pro', redirection: 'http://localhost:5174/connexion' },
} as const;

export interface CompteFictif {
  identifiant: string;
  prenom: string;
  role: 'patient' | 'proche' | 'professionnel' | 'infirmier' | 'pharmacien';
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
    identifiant: 'pharmacien-fictif-01',
    prenom: 'Léa',
    role: 'pharmacien',
    application: 'pro',
    attributs: {},
  },
];

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
