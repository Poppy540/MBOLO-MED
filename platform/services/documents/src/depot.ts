// Métadonnées des documents : mémoire (tests) ou PostgreSQL (base des services, ADR-0013).
import type { Sql } from '@mbolo/base-donnees';
import type { Format } from './format.js';

export const TYPES_DOCUMENT = ['piece-identite', 'acte-naissance', 'visage'] as const;
export type TypeDocument = (typeof TYPES_DOCUMENT)[number];

export interface Metadonnees {
  id: string;
  patientId: string;
  type: TypeDocument;
  format: Format;
  taille: number;
  versionCharte: string;
  /** Absente une fois le document supprimé (clé détruite). */
  cleEnveloppee?: Buffer;
  deposeLe: Date;
  supprimerLe: Date;
  supprimeLe?: Date;
}

export interface DepotDocuments {
  inserer(m: Metadonnees): Promise<void>;
  /**
   * Insère si le patient a moins de `max` documents présents de ce type ; faux sinon. Compter puis
   * insérer se fait sous verrou : deux envois simultanés ne dépassent pas la limite.
   */
  insererSiPlace(m: Metadonnees, max: number): Promise<boolean>;
  lire(id: string): Promise<Metadonnees | undefined>;
  /** Documents encore présents d'un patient, les plus récents d'abord. */
  duPatient(patientId: string): Promise<Metadonnees[]>;
  /** Documents arrivés à échéance et pas encore supprimés. */
  echus(maintenant: Date, limite: number): Promise<Metadonnees[]>;
  /** Détruit la clé du document (il devient illisible) ; faux s'il l'était déjà. */
  detruireCle(id: string, maintenant: Date): Promise<boolean>;
}

const present = (m: Metadonnees) => !m.supprimeLe;

export class DepotMemoire implements DepotDocuments {
  readonly lignes: Metadonnees[] = [];

  async inserer(m: Metadonnees): Promise<void> {
    this.lignes.push({ ...m });
  }

  async insererSiPlace(m: Metadonnees, max: number): Promise<boolean> {
    const n = this.lignes.filter(
      (x) => x.patientId === m.patientId && x.type === m.type && present(x),
    ).length;
    if (n >= max) return false;
    this.lignes.push({ ...m });
    return true;
  }

  async lire(id: string): Promise<Metadonnees | undefined> {
    const m = this.lignes.find((x) => x.id === id);
    return m ? { ...m } : undefined;
  }

  async duPatient(patientId: string): Promise<Metadonnees[]> {
    return this.lignes
      .filter((x) => x.patientId === patientId && present(x))
      .sort((a, b) => b.deposeLe.getTime() - a.deposeLe.getTime())
      .map((x) => ({ ...x }));
  }

  async echus(maintenant: Date, limite: number): Promise<Metadonnees[]> {
    return this.lignes
      .filter((x) => present(x) && x.supprimerLe <= maintenant)
      .slice(0, limite)
      .map((x) => ({ ...x }));
  }

  async detruireCle(id: string, maintenant: Date): Promise<boolean> {
    const m = this.lignes.find((x) => x.id === id);
    if (!m || m.supprimeLe) return false;
    delete m.cleEnveloppee;
    m.supprimeLe = maintenant;
    return true;
  }
}

interface Ligne {
  id: string;
  patient_id: string;
  type: TypeDocument;
  format: Format;
  taille: number;
  version_charte: string;
  cle_enveloppee: Buffer | null;
  depose_le: Date;
  supprimer_le: Date;
  supprime_le: Date | null;
}

const versMetadonnees = (l: Ligne): Metadonnees => ({
  id: l.id,
  patientId: l.patient_id,
  type: l.type,
  format: l.format,
  taille: l.taille,
  versionCharte: l.version_charte,
  ...(l.cle_enveloppee ? { cleEnveloppee: l.cle_enveloppee } : {}),
  deposeLe: l.depose_le,
  supprimerLe: l.supprimer_le,
  ...(l.supprime_le ? { supprimeLe: l.supprime_le } : {}),
});

/** Requêtes paramétrées uniquement (gabarits `sql`). */
export class DepotPostgres implements DepotDocuments {
  constructor(private readonly sql: Sql) {}

  async inserer(m: Metadonnees): Promise<void> {
    await this.sql`
      insert into documents.documents
        (id, patient_id, type, format, taille, version_charte, cle_enveloppee, depose_le, supprimer_le)
      values (${m.id}, ${m.patientId}, ${m.type}, ${m.format}, ${m.taille}, ${m.versionCharte},
              ${m.cleEnveloppee ?? null}, ${m.deposeLe}, ${m.supprimerLe})`;
  }

  async insererSiPlace(m: Metadonnees, max: number): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      // Verrou par patient et par type, libéré à la fin de la transaction.
      await tx`select pg_advisory_xact_lock(hashtext(${`documents:${m.patientId}:${m.type}`}))`;
      const [compte] = await tx<{ n: number }[]>`
        select count(*)::int as n from documents.documents
         where patient_id = ${m.patientId} and type = ${m.type} and supprime_le is null`;
      if ((compte?.n ?? 0) >= max) return false;
      await tx`
        insert into documents.documents
          (id, patient_id, type, format, taille, version_charte, cle_enveloppee, depose_le, supprimer_le)
        values (${m.id}, ${m.patientId}, ${m.type}, ${m.format}, ${m.taille}, ${m.versionCharte},
                ${m.cleEnveloppee ?? null}, ${m.deposeLe}, ${m.supprimerLe})`;
      return true;
    });
  }

  async lire(id: string): Promise<Metadonnees | undefined> {
    const [l] = await this.sql<Ligne[]>`select * from documents.documents where id = ${id}`;
    return l ? versMetadonnees(l) : undefined;
  }

  async duPatient(patientId: string): Promise<Metadonnees[]> {
    const lignes = await this.sql<Ligne[]>`
      select * from documents.documents
       where patient_id = ${patientId} and supprime_le is null
       order by depose_le desc`;
    return lignes.map(versMetadonnees);
  }

  async echus(maintenant: Date, limite: number): Promise<Metadonnees[]> {
    const lignes = await this.sql<Ligne[]>`
      select * from documents.documents
       where supprime_le is null and supprimer_le <= ${maintenant}
       order by supprimer_le limit ${limite}`;
    return lignes.map(versMetadonnees);
  }

  async detruireCle(id: string, maintenant: Date): Promise<boolean> {
    const r = await this.sql`
      update documents.documents set cle_enveloppee = null, supprime_le = ${maintenant}
       where id = ${id} and supprime_le is null`;
    return r.count === 1;
  }
}
