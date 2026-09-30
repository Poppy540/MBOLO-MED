// Métadonnées des documents : mémoire (tests) ou PostgreSQL (base des services, ADR-0013).
import type { Sql } from '@mbolo/base-donnees';
import type { Format } from './format.js';

export const TYPES_DOCUMENT = ['piece-identite', 'acte-naissance', 'visage'] as const;
export type TypeDocument = (typeof TYPES_DOCUMENT)[number];

export const RESULTATS = ['verifiee', 'refusee', 'a-refaire'] as const;
export type Resultat = (typeof RESULTATS)[number];

/** Motifs de refus (liste fermée, proposée au porteur de projet ; jamais de texte libre). */
export const MOTIFS_REFUS = [
  'photo-illisible',
  'document-non-conforme',
  'visage-different',
  'document-expire',
  'autre-controle-en-personne',
] as const;
export type MotifRefus = (typeof MOTIFS_REFUS)[number];

/** Décision d'un vérificateur : qui (sujet du compte), quand, quoi. */
export interface Decision {
  id: string;
  patientId: string;
  verificateur: string;
  resultat: Resultat;
  motif?: MotifRefus;
  decideLe: Date;
}

/** Patient dont les photos attendent une décision. */
export interface EnAttente {
  patientId: string;
  /** Premier dépôt depuis la dernière décision : les plus anciens sont vérifiés d'abord. */
  depuis: Date;
}

const DOCUMENT_IDENTITE: readonly TypeDocument[] = ['piece-identite', 'acte-naissance'];

export const RESULTATS_PERTE = ['acceptee', 'refusee'] as const;
export type ResultatPerte = (typeof RESULTATS_PERTE)[number];

/**
 * Demande de changement du numéro après une perte (ADR-0023). Le nouveau numéro est chiffré tant
 * que la demande est ouverte ; il est effacé (numéro et clé) à la décision.
 */
export interface DemandePerte {
  id: string;
  patientId: string;
  telephoneChiffre?: Buffer;
  cleEnveloppee?: Buffer;
  ouverteLe: Date;
  resultat?: ResultatPerte;
  verificateur?: string;
  motif?: MotifRefus;
  decideLe?: Date;
}

export interface ClotureDemandePerte {
  resultat: ResultatPerte;
  verificateur: string;
  motif?: MotifRefus;
  decideLe: Date;
}

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
  insererSiPlace(m: Metadonnees, max: number, depuis?: Date): Promise<boolean>;
  lire(id: string): Promise<Metadonnees | undefined>;
  /** Documents encore présents d'un patient, les plus récents d'abord. */
  duPatient(patientId: string): Promise<Metadonnees[]>;
  /** Documents arrivés à échéance et pas encore supprimés. */
  echus(maintenant: Date, limite: number): Promise<Metadonnees[]>;
  /** Détruit la clé du document (il devient illisible) ; faux s'il l'était déjà. */
  detruireCle(id: string, maintenant: Date): Promise<boolean>;
  /**
   * Patients qui ont, depuis leur dernière décision, une photo de document et une photo du visage
   * encore présentes ; les plus anciens d'abord.
   */
  enAttente(limite: number): Promise<EnAttente[]>;
  enregistrerDecision(d: Decision): Promise<void>;
  /** Clés des documents présents, par identifiant croissant, après `apres` (rotation). */
  clesPresentes(apres: string | undefined, limite: number): Promise<{ id: string; cle: Buffer }[]>;
  /** Remplace la clé enveloppée si elle n'a pas changé entre-temps ; faux sinon. */
  remplacerCle(id: string, ancienne: Buffer, nouvelle: Buffer): Promise<boolean>;
  /** Dernière décision prise pour ce patient. */
  derniereDecision(patientId: string): Promise<Decision | undefined>;
  /** Ouvre une demande « perte » ; faux si le patient en a déjà une ouverte. */
  ouvrirDemandePerte(d: DemandePerte): Promise<boolean>;
  demandePerteOuverte(patientId: string): Promise<DemandePerte | undefined>;
  /** Demandes ouvertes, les plus anciennes d'abord. */
  demandesPerteOuvertes(limite: number): Promise<DemandePerte[]>;
  /** Clôt une demande encore ouverte et efface le numéro chiffré ; faux si elle ne l'était plus. */
  cloreDemandePerte(id: string, c: ClotureDemandePerte): Promise<boolean>;
}

const present = (m: Metadonnees) => !m.supprimeLe;

export class DepotMemoire implements DepotDocuments {
  readonly lignes: Metadonnees[] = [];
  readonly decisions: Decision[] = [];
  readonly pertes: DemandePerte[] = [];

  async ouvrirDemandePerte(d: DemandePerte): Promise<boolean> {
    if (await this.demandePerteOuverte(d.patientId)) return false;
    this.pertes.push({ ...d });
    return true;
  }

  async demandePerteOuverte(patientId: string): Promise<DemandePerte | undefined> {
    const d = this.pertes.find((x) => x.patientId === patientId && !x.resultat);
    return d ? { ...d } : undefined;
  }

  async demandesPerteOuvertes(limite: number): Promise<DemandePerte[]> {
    return this.pertes
      .filter((x) => !x.resultat)
      .sort((a, b) => a.ouverteLe.getTime() - b.ouverteLe.getTime())
      .slice(0, limite)
      .map((x) => ({ ...x }));
  }

  async cloreDemandePerte(id: string, c: ClotureDemandePerte): Promise<boolean> {
    const d = this.pertes.find((x) => x.id === id && !x.resultat);
    if (!d) return false;
    delete d.telephoneChiffre;
    delete d.cleEnveloppee;
    Object.assign(d, c);
    return true;
  }

  async enAttente(limite: number): Promise<EnAttente[]> {
    const patients = [...new Set(this.lignes.map((l) => l.patientId))];
    const resultat: EnAttente[] = [];
    for (const patientId of patients) {
      const derniere = (await this.derniereDecision(patientId))?.decideLe.getTime() ?? -Infinity;
      const recents = this.lignes.filter(
        (l) => l.patientId === patientId && present(l) && l.deposeLe.getTime() > derniere,
      );
      if (
        recents.some((l) => DOCUMENT_IDENTITE.includes(l.type)) &&
        recents.some((l) => l.type === 'visage')
      ) {
        resultat.push({
          patientId,
          depuis: new Date(Math.min(...recents.map((l) => l.deposeLe.getTime()))),
        });
      }
    }
    return resultat.sort((a, b) => a.depuis.getTime() - b.depuis.getTime()).slice(0, limite);
  }

  async enregistrerDecision(d: Decision): Promise<void> {
    this.decisions.push({ ...d });
  }

  async clesPresentes(apres: string | undefined, limite: number) {
    return this.lignes
      .filter((l) => present(l) && l.cleEnveloppee && (apres === undefined || l.id > apres))
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .slice(0, limite)
      .map((l) => ({ id: l.id, cle: Buffer.from(l.cleEnveloppee ?? []) }));
  }

  async remplacerCle(id: string, ancienne: Buffer, nouvelle: Buffer): Promise<boolean> {
    const l = this.lignes.find((x) => x.id === id);
    if (!l || !present(l) || !l.cleEnveloppee?.equals(ancienne)) return false;
    l.cleEnveloppee = Buffer.from(nouvelle);
    return true;
  }

  async derniereDecision(patientId: string): Promise<Decision | undefined> {
    return this.decisions
      .filter((d) => d.patientId === patientId)
      .sort((a, b) => b.decideLe.getTime() - a.decideLe.getTime())[0];
  }

  async inserer(m: Metadonnees): Promise<void> {
    this.lignes.push({ ...m });
  }

  async insererSiPlace(m: Metadonnees, max: number, depuis?: Date): Promise<boolean> {
    const n = this.lignes.filter(
      (x) =>
        x.patientId === m.patientId &&
        x.type === m.type &&
        present(x) &&
        (!depuis || x.deposeLe >= depuis),
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

  async insererSiPlace(m: Metadonnees, max: number, depuis?: Date): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      // Verrou par patient et par type, libéré à la fin de la transaction.
      await tx`select pg_advisory_xact_lock(hashtext(${`documents:${m.patientId}:${m.type}`}))`;
      const [compte] = await tx<{ n: number }[]>`
        select count(*)::int as n from documents.documents
         where patient_id = ${m.patientId} and type = ${m.type} and supprime_le is null
           and (${depuis ?? null}::timestamptz is null or depose_le >= ${depuis ?? null})`;
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

  async enAttente(limite: number): Promise<EnAttente[]> {
    const lignes = await this.sql<{ patient_id: string; depuis: Date }[]>`
      select d.patient_id, min(d.depose_le) as depuis
        from documents.documents d
        left join lateral (
          select max(x.decide_le) as le from documents.decisions x where x.patient_id = d.patient_id
        ) derniere on true
       where d.supprime_le is null and (derniere.le is null or d.depose_le > derniere.le)
       group by d.patient_id
      having bool_or(d.type in ('piece-identite', 'acte-naissance')) and bool_or(d.type = 'visage')
       order by depuis
       limit ${limite}`;
    return lignes.map((l) => ({ patientId: l.patient_id, depuis: l.depuis }));
  }

  async clesPresentes(apres: string | undefined, limite: number) {
    const lignes = await this.sql<{ id: string; cle_enveloppee: Buffer }[]>`
      select id, cle_enveloppee from documents.documents
       where supprime_le is null and cle_enveloppee is not null
         and (${apres ?? null}::uuid is null or id > ${apres ?? null}::uuid)
       order by id limit ${limite}`;
    return lignes.map((l) => ({ id: l.id, cle: l.cle_enveloppee }));
  }

  async remplacerCle(id: string, ancienne: Buffer, nouvelle: Buffer): Promise<boolean> {
    const r = await this.sql`
      update documents.documents set cle_enveloppee = ${nouvelle}
       where id = ${id} and supprime_le is null and cle_enveloppee = ${ancienne}`;
    return r.count === 1;
  }

  async enregistrerDecision(d: Decision): Promise<void> {
    await this.sql`
      insert into documents.decisions (id, patient_id, verificateur, resultat, motif, decide_le)
      values (${d.id}, ${d.patientId}, ${d.verificateur}, ${d.resultat}, ${d.motif ?? null},
              ${d.decideLe})`;
  }

  async derniereDecision(patientId: string): Promise<Decision | undefined> {
    const [l] = await this.sql<
      {
        id: string;
        patient_id: string;
        verificateur: string;
        resultat: Resultat;
        motif: MotifRefus | null;
        decide_le: Date;
      }[]
    >`select * from documents.decisions where patient_id = ${patientId}
       order by decide_le desc limit 1`;
    return l
      ? {
          id: l.id,
          patientId: l.patient_id,
          verificateur: l.verificateur,
          resultat: l.resultat,
          ...(l.motif ? { motif: l.motif } : {}),
          decideLe: l.decide_le,
        }
      : undefined;
  }

  async detruireCle(id: string, maintenant: Date): Promise<boolean> {
    const r = await this.sql`
      update documents.documents set cle_enveloppee = null, supprime_le = ${maintenant}
       where id = ${id} and supprime_le is null`;
    return r.count === 1;
  }

  async ouvrirDemandePerte(d: DemandePerte): Promise<boolean> {
    try {
      await this.sql`
        insert into documents.demandes_perte
          (id, patient_id, telephone_chiffre, cle_enveloppee, ouverte_le)
        values (${d.id}, ${d.patientId}, ${d.telephoneChiffre ?? null},
                ${d.cleEnveloppee ?? null}, ${d.ouverteLe})`;
      return true;
    } catch (e) {
      // Index unique : une seule demande ouverte par patient, même pour deux envois simultanés.
      if ((e as { code?: string }).code === '23505') return false;
      throw e;
    }
  }

  async demandePerteOuverte(patientId: string): Promise<DemandePerte | undefined> {
    const [l] = await this.sql<LignePerte[]>`
      select * from documents.demandes_perte where patient_id = ${patientId} and resultat is null`;
    return l ? versDemandePerte(l) : undefined;
  }

  async demandesPerteOuvertes(limite: number): Promise<DemandePerte[]> {
    const lignes = await this.sql<LignePerte[]>`
      select * from documents.demandes_perte where resultat is null
       order by ouverte_le limit ${limite}`;
    return lignes.map(versDemandePerte);
  }

  async cloreDemandePerte(id: string, c: ClotureDemandePerte): Promise<boolean> {
    const r = await this.sql`
      update documents.demandes_perte
         set telephone_chiffre = null, cle_enveloppee = null, resultat = ${c.resultat},
             verificateur = ${c.verificateur}, motif = ${c.motif ?? null}, decide_le = ${c.decideLe}
       where id = ${id} and resultat is null`;
    return r.count === 1;
  }
}

interface LignePerte {
  id: string;
  patient_id: string;
  telephone_chiffre: Buffer | null;
  cle_enveloppee: Buffer | null;
  ouverte_le: Date;
  resultat: ResultatPerte | null;
  verificateur: string | null;
  motif: MotifRefus | null;
  decide_le: Date | null;
}

const versDemandePerte = (l: LignePerte): DemandePerte => ({
  id: l.id,
  patientId: l.patient_id,
  ...(l.telephone_chiffre ? { telephoneChiffre: l.telephone_chiffre } : {}),
  ...(l.cle_enveloppee ? { cleEnveloppee: l.cle_enveloppee } : {}),
  ouverteLe: l.ouverte_le,
  ...(l.resultat ? { resultat: l.resultat } : {}),
  ...(l.verificateur ? { verificateur: l.verificateur } : {}),
  ...(l.motif ? { motif: l.motif } : {}),
  ...(l.decide_le ? { decideLe: l.decide_le } : {}),
});
