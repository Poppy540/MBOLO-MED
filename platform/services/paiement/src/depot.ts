// Stockage des paiements (ADR-0017) : interface commune, dépôt en mémoire (tests) et PostgreSQL.
// Chaque changement de statut est une mise à jour conditionnelle : deux requêtes simultanées ne
// démarrent jamais deux collectes pour un même paiement.
import type { Sql } from '@mbolo/base-donnees';
import type { TypeConsultation } from './tarifs.js';

export const STATUTS = ['a-payer', 'en-attente', 'paye', 'echoue'] as const;
export type Statut = (typeof STATUTS)[number];

export interface Paiement {
  id: string;
  /** Référence opaque du rendez-vous (identifiant FHIR), jamais son contenu. */
  reference: string;
  /** Compte Keycloak (sub) du patient concerné. */
  sujet: string;
  typeConsultation: TypeConsultation;
  /** Référence opaque du professionnel du rendez-vous (relevés, ADR-0020) ; absente avant la PR BQ. */
  praticien?: string;
  montant: number;
  devise: string;
  statut: Statut;
  operateur?: string;
  /** Tentative de collecte en cours ou dernière tentative (clé d'idempotence chez le prestataire). */
  tentative?: string;
  fournisseur?: string;
  creeLe: Date;
  misAJourLe: Date;
  payeLe?: Date;
  /** Rendez-vous annulé (signalé par la téléconsultation) : plus aucune collecte possible. */
  annuleLe?: Date;
}

export const STATUTS_REMBOURSEMENT = ['a-valider', 'valide', 'refuse', 'effectue'] as const;
export type StatutRemboursement = (typeof STATUTS_REMBOURSEMENT)[number];

/**
 * Remboursement préparé par la plateforme (paiement reçu pour un rendez-vous annulé), exécuté
 * seulement après la décision d'un humain (rôle validation-remboursement). Aucun texte libre.
 */
export interface Remboursement {
  id: string;
  paiementId: string;
  montant: number;
  devise: string;
  statut: StatutRemboursement;
  prepareLe: Date;
  /** Compte Keycloak (sub) de la personne qui a décidé. */
  decidePar?: string;
  decideLe?: Date;
  effectueLe?: Date;
}

export interface Demarrage {
  tentative: string;
  operateur: string;
  fournisseur: string;
}

export interface DepotPaiements {
  /** Crée le paiement, ou renvoie celui qui existe déjà pour cette référence (idempotent). */
  creer(p: Paiement): Promise<Paiement>;
  trouver(id: string): Promise<Paiement | undefined>;
  trouverParReference(reference: string): Promise<Paiement | undefined>;
  trouverParTentative(tentative: string): Promise<Paiement | undefined>;
  /**
   * Passe « à payer » ou « échoué » à « en attente » ; `undefined` si une collecte est en cours ou
   * faite, ou si le rendez-vous est annulé.
   */
  demarrer(id: string, d: Demarrage, maintenant: Date): Promise<Paiement | undefined>;
  /** Conclut la tentative en cours ; `undefined` si elle n'est plus la tentative en attente. */
  conclure(
    tentative: string,
    resultat: 'paye' | 'echoue',
    maintenant: Date,
  ): Promise<Paiement | undefined>;
  /** Marque le rendez-vous annulé (idempotent : la première date est gardée). */
  annuler(reference: string, maintenant: Date): Promise<Paiement | undefined>;
  enAttente(): Promise<Paiement[]>;
  /** Paiements reçus pour un rendez-vous annulé, sans remboursement préparé. */
  payesAnnulesSansRemboursement(): Promise<Paiement[]>;
  /** Prépare le remboursement d'un paiement ; `undefined` s'il en existe déjà un (un seul par paiement). */
  preparerRemboursement(r: Remboursement): Promise<Remboursement | undefined>;
  trouverRemboursement(id: string): Promise<Remboursement | undefined>;
  remboursements(statut: StatutRemboursement): Promise<Remboursement[]>;
  /** Décision d'un humain sur un remboursement « à valider » ; `undefined` s'il a déjà été décidé. */
  deciderRemboursement(
    id: string,
    decision: 'valide' | 'refuse',
    par: string,
    maintenant: Date,
  ): Promise<Remboursement | undefined>;
  /** Remboursement validé puis exécuté chez le prestataire. */
  marquerEffectue(id: string, maintenant: Date): Promise<Remboursement | undefined>;
}

export class DepotMemoire implements DepotPaiements {
  readonly paiements: Paiement[] = [];

  async creer(p: Paiement): Promise<Paiement> {
    const existant = this.paiements.find((x) => x.reference === p.reference);
    if (existant) return { ...existant };
    this.paiements.push({ ...p });
    return { ...p };
  }

  async trouver(id: string): Promise<Paiement | undefined> {
    const p = this.paiements.find((x) => x.id === id);
    return p ? { ...p } : undefined;
  }

  async trouverParReference(reference: string): Promise<Paiement | undefined> {
    const p = this.paiements.find((x) => x.reference === reference);
    return p ? { ...p } : undefined;
  }

  async trouverParTentative(tentative: string): Promise<Paiement | undefined> {
    const p = this.paiements.find((x) => x.tentative === tentative);
    return p ? { ...p } : undefined;
  }

  async demarrer(id: string, d: Demarrage, maintenant: Date): Promise<Paiement | undefined> {
    const p = this.paiements.find((x) => x.id === id);
    if (!p || p.annuleLe || (p.statut !== 'a-payer' && p.statut !== 'echoue')) return undefined;
    Object.assign(p, { ...d, statut: 'en-attente', misAJourLe: maintenant });
    return { ...p };
  }

  async conclure(
    tentative: string,
    resultat: 'paye' | 'echoue',
    maintenant: Date,
  ): Promise<Paiement | undefined> {
    const p = this.paiements.find((x) => x.tentative === tentative);
    if (!p || p.statut !== 'en-attente') return undefined;
    p.statut = resultat;
    p.misAJourLe = maintenant;
    if (resultat === 'paye') p.payeLe = maintenant;
    return { ...p };
  }

  readonly remboursementsEnMemoire: Remboursement[] = [];

  async annuler(reference: string, maintenant: Date): Promise<Paiement | undefined> {
    const p = this.paiements.find((x) => x.reference === reference);
    if (!p) return undefined;
    p.annuleLe ??= maintenant;
    return { ...p };
  }

  async enAttente(): Promise<Paiement[]> {
    return this.paiements.filter((x) => x.statut === 'en-attente').map((x) => ({ ...x }));
  }

  async payesAnnulesSansRemboursement(): Promise<Paiement[]> {
    return this.paiements
      .filter(
        (x) =>
          x.statut === 'paye' &&
          x.annuleLe &&
          !this.remboursementsEnMemoire.some((r) => r.paiementId === x.id),
      )
      .map((x) => ({ ...x }));
  }

  async preparerRemboursement(r: Remboursement): Promise<Remboursement | undefined> {
    if (this.remboursementsEnMemoire.some((x) => x.paiementId === r.paiementId)) return undefined;
    this.remboursementsEnMemoire.push({ ...r });
    return { ...r };
  }

  async trouverRemboursement(id: string): Promise<Remboursement | undefined> {
    const r = this.remboursementsEnMemoire.find((x) => x.id === id);
    return r ? { ...r } : undefined;
  }

  async remboursements(statut: StatutRemboursement): Promise<Remboursement[]> {
    return this.remboursementsEnMemoire.filter((x) => x.statut === statut).map((x) => ({ ...x }));
  }

  async deciderRemboursement(
    id: string,
    decision: 'valide' | 'refuse',
    par: string,
    maintenant: Date,
  ): Promise<Remboursement | undefined> {
    const r = this.remboursementsEnMemoire.find((x) => x.id === id);
    if (!r || r.statut !== 'a-valider') return undefined;
    Object.assign(r, { statut: decision, decidePar: par, decideLe: maintenant });
    return { ...r };
  }

  async marquerEffectue(id: string, maintenant: Date): Promise<Remboursement | undefined> {
    const r = this.remboursementsEnMemoire.find((x) => x.id === id);
    if (!r || r.statut !== 'valide') return undefined;
    Object.assign(r, { statut: 'effectue', effectueLe: maintenant });
    return { ...r };
  }
}

interface Ligne {
  id: string;
  reference: string;
  sujet: string;
  type_consultation: TypeConsultation;
  praticien: string | null;
  montant: string;
  devise: string;
  statut: Statut;
  operateur: string | null;
  tentative: string | null;
  fournisseur: string | null;
  cree_le: Date;
  mis_a_jour_le: Date;
  paye_le: Date | null;
  annule_le: Date | null;
}

interface LigneRemboursement {
  id: string;
  paiement_id: string;
  montant: string;
  devise: string;
  statut: StatutRemboursement;
  prepare_le: Date;
  decide_par: string | null;
  decide_le: Date | null;
  effectue_le: Date | null;
}

const versRemboursement = (l: LigneRemboursement): Remboursement => ({
  id: l.id,
  paiementId: l.paiement_id,
  montant: Number(l.montant),
  devise: l.devise,
  statut: l.statut,
  prepareLe: l.prepare_le,
  ...(l.decide_par ? { decidePar: l.decide_par } : {}),
  ...(l.decide_le ? { decideLe: l.decide_le } : {}),
  ...(l.effectue_le ? { effectueLe: l.effectue_le } : {}),
});

const versPaiement = (l: Ligne): Paiement => ({
  id: l.id,
  reference: l.reference,
  sujet: l.sujet,
  typeConsultation: l.type_consultation,
  ...(l.praticien ? { praticien: l.praticien } : {}),
  // bigint lu comme texte par le pilote : les montants restent des entiers sûrs (vérifiés à la grille).
  montant: Number(l.montant),
  devise: l.devise,
  statut: l.statut,
  ...(l.operateur ? { operateur: l.operateur } : {}),
  ...(l.tentative ? { tentative: l.tentative } : {}),
  ...(l.fournisseur ? { fournisseur: l.fournisseur } : {}),
  creeLe: l.cree_le,
  misAJourLe: l.mis_a_jour_le,
  ...(l.paye_le ? { payeLe: l.paye_le } : {}),
  ...(l.annule_le ? { annuleLe: l.annule_le } : {}),
});

/** Requêtes paramétrées uniquement (gabarits `sql`), jamais de SQL construit par concaténation. */
export class DepotPostgres implements DepotPaiements {
  constructor(private readonly sql: Sql) {}

  async creer(p: Paiement): Promise<Paiement> {
    const [cree] = await this.sql<Ligne[]>`
      insert into paiement.paiements
        (id, reference, sujet, type_consultation, praticien, montant, devise, statut, cree_le,
         mis_a_jour_le)
      values (${p.id}, ${p.reference}, ${p.sujet}, ${p.typeConsultation}, ${p.praticien ?? null},
              ${p.montant}, ${p.devise}, 'a-payer', ${p.creeLe}, ${p.misAJourLe})
      on conflict (reference) do nothing
      returning *`;
    if (cree) return versPaiement(cree);
    const existant = await this.trouverParReference(p.reference);
    if (!existant) throw new Error('Paiement introuvable après conflit.');
    return existant;
  }

  async trouver(id: string): Promise<Paiement | undefined> {
    const [l] = await this.sql<Ligne[]>`select * from paiement.paiements where id = ${id}`;
    return l ? versPaiement(l) : undefined;
  }

  async trouverParReference(reference: string): Promise<Paiement | undefined> {
    const [l] = await this.sql<Ligne[]>`
      select * from paiement.paiements where reference = ${reference}`;
    return l ? versPaiement(l) : undefined;
  }

  async trouverParTentative(tentative: string): Promise<Paiement | undefined> {
    const [l] = await this.sql<Ligne[]>`
      select * from paiement.paiements where tentative = ${tentative}`;
    return l ? versPaiement(l) : undefined;
  }

  async demarrer(id: string, d: Demarrage, maintenant: Date): Promise<Paiement | undefined> {
    const [l] = await this.sql<Ligne[]>`
      update paiement.paiements
         set statut = 'en-attente', tentative = ${d.tentative}, operateur = ${d.operateur},
             fournisseur = ${d.fournisseur}, mis_a_jour_le = ${maintenant}
       where id = ${id} and statut in ('a-payer', 'echoue') and annule_le is null
      returning *`;
    return l ? versPaiement(l) : undefined;
  }

  async conclure(
    tentative: string,
    resultat: 'paye' | 'echoue',
    maintenant: Date,
  ): Promise<Paiement | undefined> {
    const payeLe = resultat === 'paye' ? maintenant : null;
    const [l] = await this.sql<Ligne[]>`
      update paiement.paiements
         set statut = ${resultat}, mis_a_jour_le = ${maintenant}, paye_le = ${payeLe}
       where tentative = ${tentative} and statut = 'en-attente'
      returning *`;
    return l ? versPaiement(l) : undefined;
  }

  async annuler(reference: string, maintenant: Date): Promise<Paiement | undefined> {
    const [l] = await this.sql<Ligne[]>`
      update paiement.paiements
         set annule_le = coalesce(annule_le, ${maintenant}), mis_a_jour_le = ${maintenant}
       where reference = ${reference}
      returning *`;
    return l ? versPaiement(l) : undefined;
  }

  async enAttente(): Promise<Paiement[]> {
    const lignes = await this.sql<Ligne[]>`
      select * from paiement.paiements where statut = 'en-attente' order by mis_a_jour_le limit 500`;
    return lignes.map(versPaiement);
  }

  async payesAnnulesSansRemboursement(): Promise<Paiement[]> {
    const lignes = await this.sql<Ligne[]>`
      select p.* from paiement.paiements p
       where p.statut = 'paye' and p.annule_le is not null
         and not exists (select 1 from paiement.remboursements r where r.paiement_id = p.id)
       limit 500`;
    return lignes.map(versPaiement);
  }

  async preparerRemboursement(r: Remboursement): Promise<Remboursement | undefined> {
    const [l] = await this.sql<LigneRemboursement[]>`
      insert into paiement.remboursements (id, paiement_id, montant, devise, statut, prepare_le)
      values (${r.id}, ${r.paiementId}, ${r.montant}, ${r.devise}, 'a-valider', ${r.prepareLe})
      on conflict (paiement_id) do nothing
      returning *`;
    return l ? versRemboursement(l) : undefined;
  }

  async trouverRemboursement(id: string): Promise<Remboursement | undefined> {
    const [l] = await this.sql<LigneRemboursement[]>`
      select * from paiement.remboursements where id = ${id}`;
    return l ? versRemboursement(l) : undefined;
  }

  async remboursements(statut: StatutRemboursement): Promise<Remboursement[]> {
    const lignes = await this.sql<LigneRemboursement[]>`
      select * from paiement.remboursements where statut = ${statut}
       order by prepare_le limit 200`;
    return lignes.map(versRemboursement);
  }

  async deciderRemboursement(
    id: string,
    decision: 'valide' | 'refuse',
    par: string,
    maintenant: Date,
  ): Promise<Remboursement | undefined> {
    const [l] = await this.sql<LigneRemboursement[]>`
      update paiement.remboursements
         set statut = ${decision}, decide_par = ${par}, decide_le = ${maintenant}
       where id = ${id} and statut = 'a-valider'
      returning *`;
    return l ? versRemboursement(l) : undefined;
  }

  async marquerEffectue(id: string, maintenant: Date): Promise<Remboursement | undefined> {
    const [l] = await this.sql<LigneRemboursement[]>`
      update paiement.remboursements set statut = 'effectue', effectue_le = ${maintenant}
       where id = ${id} and statut = 'valide'
      returning *`;
    return l ? versRemboursement(l) : undefined;
  }
}
