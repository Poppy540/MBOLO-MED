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
  /** Passe « à payer » ou « échoué » à « en attente » ; `undefined` si une collecte est en cours ou faite. */
  demarrer(id: string, d: Demarrage, maintenant: Date): Promise<Paiement | undefined>;
  /** Conclut la tentative en cours ; `undefined` si elle n'est plus la tentative en attente. */
  conclure(
    tentative: string,
    resultat: 'paye' | 'echoue',
    maintenant: Date,
  ): Promise<Paiement | undefined>;
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
    if (!p || (p.statut !== 'a-payer' && p.statut !== 'echoue')) return undefined;
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
}

interface Ligne {
  id: string;
  reference: string;
  sujet: string;
  type_consultation: TypeConsultation;
  montant: string;
  devise: string;
  statut: Statut;
  operateur: string | null;
  tentative: string | null;
  fournisseur: string | null;
  cree_le: Date;
  mis_a_jour_le: Date;
  paye_le: Date | null;
}

const versPaiement = (l: Ligne): Paiement => ({
  id: l.id,
  reference: l.reference,
  sujet: l.sujet,
  typeConsultation: l.type_consultation,
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
});

/** Requêtes paramétrées uniquement (gabarits `sql`), jamais de SQL construit par concaténation. */
export class DepotPostgres implements DepotPaiements {
  constructor(private readonly sql: Sql) {}

  async creer(p: Paiement): Promise<Paiement> {
    const [cree] = await this.sql<Ligne[]>`
      insert into paiement.paiements
        (id, reference, sujet, type_consultation, montant, devise, statut, cree_le, mis_a_jour_le)
      values (${p.id}, ${p.reference}, ${p.sujet}, ${p.typeConsultation}, ${p.montant},
              ${p.devise}, 'a-payer', ${p.creeLe}, ${p.misAJourLe})
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
       where id = ${id} and statut in ('a-payer', 'echoue')
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
}
