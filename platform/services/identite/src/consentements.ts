// Gestion des consentements (skill recueil-consentement) : enregistrer, révoquer, lister.
// Les ressources sont construites et vérifiées par @mbolo/dossier-fhir ; le stockage est abstrait
// (dépôt en mémoire pour les tests, dépôt FHIR `DepotFhir` pour le dossier médical).
import type { Consent } from 'fhir/r4.js';
import {
  CATEGORIES_PATIENT_SEUL,
  consentement,
  revoquer,
  valider,
  type CategorieConsentement,
  type Environnement,
  type ModeRecueil,
} from '@mbolo/dossier-fhir';
import type { Drapeaux } from '@mbolo/drapeaux';
import { peutGererConsentements } from './acces.js';
import type { Utilisateur } from './roles.js';

export interface DepotConsentements {
  ajouter(c: Consent): Promise<Consent>;
  lire(id: string): Promise<Consent | undefined>;
  remplacer(c: Consent): Promise<void>;
  parPatient(patientId: string): Promise<Consent[]>;
}

/** Dépôt en mémoire — développement et tests uniquement (données fictives). */
export class DepotMemoire implements DepotConsentements {
  private readonly donnees = new Map<string, Consent>();
  private compteur = 0;

  async ajouter(c: Consent): Promise<Consent> {
    this.compteur += 1;
    const avecId = { ...c, id: `consent-${this.compteur}` };
    this.donnees.set(avecId.id, avecId);
    return avecId;
  }
  async lire(id: string): Promise<Consent | undefined> {
    return this.donnees.get(id);
  }
  async remplacer(c: Consent): Promise<void> {
    if (c.id) this.donnees.set(c.id, c);
  }
  async parPatient(patientId: string): Promise<Consent[]> {
    return [...this.donnees.values()].filter(
      (c) => c.patient?.reference === `Patient/${patientId}`,
    );
  }
}

export class ErreurAcces extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurAcces';
  }
}

/** Fonction pas encore activée pour ce compte (feature flag désactivé, ADR-0003). */
export class ErreurFonctionInactive extends Error {
  constructor() {
    super('Fonction non disponible.');
    this.name = 'ErreurFonctionInactive';
  }
}

export class ErreurValidation extends Error {
  constructor(
    message: string,
    readonly regles: string[],
  ) {
    super(message);
    this.name = 'ErreurValidation';
  }
}

export interface DemandeConsentement {
  categorie: CategorieConsentement;
  mode: ModeRecueil;
  versionTexte: string;
  accepte: boolean;
  beneficiaire?: string;
}

export class ServiceConsentements {
  constructor(
    private readonly depot: DepotConsentements,
    private readonly env: Environnement,
    /** Feature flags : le partage avec un proche n'est proposé qu'à partir de la vague 2. */
    private readonly drapeaux: Pick<Drapeaux, 'estActif'>,
    private readonly maintenant: () => Date = () => new Date(),
  ) {}

  async lister(u: Utilisateur, patientId: string): Promise<Consent[]> {
    if (!peutGererConsentements(u, patientId)) throw new ErreurAcces('Accès refusé.');
    return this.depot.parPatient(patientId);
  }

  async enregistrer(u: Utilisateur, patientId: string, d: DemandeConsentement): Promise<Consent> {
    if (!peutGererConsentements(u, patientId)) throw new ErreurAcces('Accès refusé.');
    // Charte d'identité (ADR-0015) : acceptée par le patient lui-même, jamais par un agent IA.
    if (CATEGORIES_PATIENT_SEUL.includes(d.categorie) && !u.roles.includes('patient')) {
      throw new ErreurAcces('Accès refusé.');
    }
    if (
      d.categorie === 'C-PROCHE' &&
      !(await this.drapeaux.estActif('consentement.proche', {
        sujet: u.sujet,
        ...(u.roles[0] ? { typeUtilisateur: u.roles[0] } : {}),
      }))
    ) {
      throw new ErreurFonctionInactive();
    }
    const ressource = consentement({
      patientId,
      categorie: d.categorie,
      mode: d.mode,
      date: this.maintenant().toISOString(),
      versionTexte: d.versionTexte,
      accepte: d.accepte,
      env: this.env,
      ...(d.beneficiaire ? { beneficiaire: d.beneficiaire } : {}),
    });
    const violations = valider(ressource, this.env);
    if (violations.length > 0) {
      throw new ErreurValidation(
        'Consentement invalide.',
        violations.map((v) => v.regle),
      );
    }
    return this.depot.ajouter(ressource);
  }

  /**
   * Retrait des proches par l'équipe (rôle assistance-patient, ADR-0019), à la demande du patient
   * joint au numéro de son dossier : révoque tous ses partages C-PROCHE actifs, et eux seuls. Jamais
   * un agent IA, jamais pour son propre dossier. Retourne le nombre de partages révoqués.
   */
  async retirerProchesParAssistance(u: Utilisateur, patientId: string): Promise<number> {
    if (
      !u.roles.includes('assistance-patient') ||
      u.roles.includes('agent-ia') ||
      u.agent ||
      u.patientId === patientId
    ) {
      throw new ErreurAcces('Accès refusé.');
    }
    let n = 0;
    for (const c of await this.depot.parPatient(patientId)) {
      if (c.status === 'active' && c.category?.[0]?.coding?.[0]?.code === 'C-PROCHE') {
        await this.depot.remplacer(revoquer(c));
        n += 1;
      }
    }
    return n;
  }

  /** Révocation : effet immédiat, la ressource est conservée (statut inactive) pour la traçabilité. */
  async revoquer(u: Utilisateur, consentementId: string): Promise<Consent> {
    const c = await this.depot.lire(consentementId);
    const patientId = c?.patient?.reference?.replace('Patient/', '');
    // Même réponse si le consentement n'existe pas ou n'appartient pas à l'utilisateur :
    // on ne révèle pas l'existence des consentements des autres.
    if (!c || !patientId || !peutGererConsentements(u, patientId)) {
      throw new ErreurAcces('Accès refusé.');
    }
    const revoque = revoquer(c);
    await this.depot.remplacer(revoque);
    return revoque;
  }
}
