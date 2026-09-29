// Stockage des invitations : interface commune, dépôt en mémoire (tests) et dépôt PostgreSQL (ADR-0013).
import type { Sql } from '@mbolo/base-donnees';

export interface Invitation {
  id: string;
  empreinte: Buffer;
  cohorte: string;
  /** Code d'un patient (ADR-0013) ou d'un proche invité par un patient (ADR-0019). */
  type: TypeInvitation;
  /** Fiche du proche dans le dossier (RelatedPerson), pour un code de proche seulement. */
  relatedPersonId?: string;
  /** Dossier du patient (référence opaque), pour un code de récupération seulement (ADR-0021). */
  patientId?: string;
  /** Identifiant Keycloak opaque (sub) du créateur. */
  creePar: string;
  creeLe: Date;
  expireLe: Date;
  utiliseLe?: Date;
  utilisePar?: string;
  revoqueLe?: Date;
}

export type Statut = 'valide' | 'utilise' | 'revoque' | 'expire';
/**
 * `patient` et `proche` créent un compte ; `recuperation` (ADR-0021) rend l'accès à un compte
 * existant et n'est jamais accepté à l'inscription.
 */
export type TypeInvitation = 'patient' | 'proche' | 'recuperation';

/** Cohorte technique des codes de proches : jamais une cohorte ouverte par un déploiement. */
export const COHORTE_PROCHES = 'proches';
/** Cohorte technique des codes de récupération (ADR-0021). */
export const COHORTE_RECUPERATION = 'recuperation';

/** Proches qui comptent dans la limite : invitation en cours ou compte créé (pas révoquée ni expirée). */
const compteDansLimite = (i: Invitation, maintenant: Date) =>
  i.type === 'proche' && !i.revoqueLe && (!!i.utiliseLe || i.expireLe > maintenant);

export function statut(i: Invitation, maintenant: Date): Statut {
  if (i.revoqueLe) return 'revoque';
  if (i.utiliseLe) return 'utilise';
  if (i.expireLe <= maintenant) return 'expire';
  return 'valide';
}

export interface DepotInvitations {
  /**
   * Enregistre l'invitation si la cohorte compte moins de `quota` invitations (révoquées comprises :
   * une révocation ne rend pas de place). Atomique : deux créations simultanées ne dépassent pas le quota.
   */
  creerSousQuota(i: Invitation, quota: number): Promise<'cree' | 'quota-atteint' | 'doublon'>;
  trouver(empreinte: Buffer): Promise<Invitation | undefined>;
  /** Utilise un code valide ; atomique : un même code ne sert jamais deux fois. */
  utiliser(empreinte: Buffer, sujet: string, maintenant: Date): Promise<Invitation | undefined>;
  /** Révoque un code encore inutilisé ; `false` s'il n'existe pas ou a déjà servi. */
  revoquer(id: string, maintenant: Date): Promise<boolean>;
  lister(cohorte: string, limite: number): Promise<Invitation[]>;
  /**
   * Enregistre l'invitation d'un proche si le patient en compte moins de `max` (en cours ou
   * utilisées). Atomique par patient : deux invitations simultanées ne dépassent pas la limite.
   */
  creerPourProche(
    i: Invitation,
    max: number,
    maintenant: Date,
    parJour: { max: number; depuis: Date },
  ): Promise<'cree' | 'limite-atteinte' | 'limite-jour' | 'doublon'>;
  /** Invitations de proches créées par ce patient, les plus récentes d'abord. */
  listerProches(creePar: string): Promise<Invitation[]>;
  /**
   * Révoque l'invitation d'un proche, utilisée ou non (le patient retire ce proche), seulement par
   * le patient qui l'a créée ; une invitation révoquée ne compte plus dans la limite.
   */
  revoquerProche(id: string, creePar: string, maintenant: Date): Promise<boolean>;
  /** Invitation de proche rattachée à cette fiche du dossier (la plus récente). */
  parFiche(relatedPersonId: string): Promise<Invitation | undefined>;
  /**
   * Révoque l'invitation rattachée à cette fiche, utilisée ou non : retrait par l'équipe
   * d'assistance, à la demande du patient (ADR-0019).
   */
  revoquerParFiche(relatedPersonId: string, maintenant: Date): Promise<boolean>;
  /**
   * Enregistre un code de récupération (ADR-0021) et révoque, dans la même transaction, les codes
   * de récupération encore inutilisés de ce dossier : un seul code valable à la fois.
   */
  creerRecuperation(i: Invitation, maintenant: Date): Promise<'cree' | 'doublon'>;
}

export class DepotMemoire implements DepotInvitations {
  readonly invitations: Invitation[] = [];

  async creerSousQuota(
    i: Invitation,
    quota: number,
  ): Promise<'cree' | 'quota-atteint' | 'doublon'> {
    if (this.invitations.some((x) => x.empreinte.equals(i.empreinte))) return 'doublon';
    if (this.invitations.filter((x) => x.cohorte === i.cohorte).length >= quota) {
      return 'quota-atteint';
    }
    this.invitations.push({ ...i });
    return 'cree';
  }

  async trouver(empreinte: Buffer): Promise<Invitation | undefined> {
    const i = this.invitations.find((x) => x.empreinte.equals(empreinte));
    return i ? { ...i } : undefined;
  }

  async utiliser(
    empreinte: Buffer,
    sujet: string,
    maintenant: Date,
  ): Promise<Invitation | undefined> {
    const i = this.invitations.find((x) => x.empreinte.equals(empreinte));
    if (!i || statut(i, maintenant) !== 'valide') return undefined;
    i.utiliseLe = maintenant;
    i.utilisePar = sujet;
    return { ...i };
  }

  async revoquer(id: string, maintenant: Date): Promise<boolean> {
    const i = this.invitations.find((x) => x.id === id);
    if (!i || i.utiliseLe || i.revoqueLe) return false;
    i.revoqueLe = maintenant;
    return true;
  }

  async lister(cohorte: string, limite: number): Promise<Invitation[]> {
    return this.invitations
      .filter((x) => x.cohorte === cohorte)
      .sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime())
      .slice(0, limite)
      .map((x) => ({ ...x }));
  }

  async creerPourProche(
    i: Invitation,
    max: number,
    maintenant: Date,
    parJour: { max: number; depuis: Date },
  ): Promise<'cree' | 'limite-atteinte' | 'limite-jour' | 'doublon'> {
    if (this.invitations.some((x) => x.empreinte.equals(i.empreinte))) return 'doublon';
    const recentes = this.invitations.filter(
      (x) => x.creePar === i.creePar && x.type === 'proche' && x.creeLe > parJour.depuis,
    ).length;
    if (recentes >= parJour.max) return 'limite-jour';
    const n = this.invitations.filter(
      (x) => x.creePar === i.creePar && compteDansLimite(x, maintenant),
    ).length;
    if (n >= max) return 'limite-atteinte';
    this.invitations.push({ ...i });
    return 'cree';
  }

  async listerProches(creePar: string): Promise<Invitation[]> {
    return this.invitations
      .filter((x) => x.creePar === creePar && x.type === 'proche')
      .sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime())
      .map((x) => ({ ...x }));
  }

  async revoquerProche(id: string, creePar: string, maintenant: Date): Promise<boolean> {
    const i = this.invitations.find(
      (x) => x.id === id && x.creePar === creePar && x.type === 'proche',
    );
    if (!i || i.revoqueLe) return false;
    i.revoqueLe = maintenant;
    return true;
  }

  async parFiche(relatedPersonId: string): Promise<Invitation | undefined> {
    const i = this.invitations
      .filter((x) => x.type === 'proche' && x.relatedPersonId === relatedPersonId)
      .sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime())[0];
    return i ? { ...i } : undefined;
  }

  async revoquerParFiche(relatedPersonId: string, maintenant: Date): Promise<boolean> {
    let n = 0;
    for (const i of this.invitations) {
      if (i.type === 'proche' && i.relatedPersonId === relatedPersonId && !i.revoqueLe) {
        i.revoqueLe = maintenant;
        n += 1;
      }
    }
    return n > 0;
  }

  async creerRecuperation(i: Invitation, maintenant: Date): Promise<'cree' | 'doublon'> {
    if (this.invitations.some((x) => x.empreinte.equals(i.empreinte))) return 'doublon';
    for (const x of this.invitations) {
      if (
        x.type === 'recuperation' &&
        x.patientId === i.patientId &&
        !x.utiliseLe &&
        !x.revoqueLe
      ) {
        x.revoqueLe = maintenant;
      }
    }
    this.invitations.push({ ...i });
    return 'cree';
  }
}

interface Ligne {
  id: string;
  empreinte: Buffer;
  cohorte: string;
  type: TypeInvitation;
  related_person_id: string | null;
  patient_id: string | null;
  cree_par: string;
  cree_le: Date;
  expire_le: Date;
  utilise_le: Date | null;
  utilise_par: string | null;
  revoque_le: Date | null;
}

const versInvitation = (l: Ligne): Invitation => ({
  id: l.id,
  empreinte: l.empreinte,
  cohorte: l.cohorte,
  type: l.type,
  ...(l.related_person_id ? { relatedPersonId: l.related_person_id } : {}),
  ...(l.patient_id ? { patientId: l.patient_id } : {}),
  creePar: l.cree_par,
  creeLe: l.cree_le,
  expireLe: l.expire_le,
  ...(l.utilise_le ? { utiliseLe: l.utilise_le } : {}),
  ...(l.utilise_par ? { utilisePar: l.utilise_par } : {}),
  ...(l.revoque_le ? { revoqueLe: l.revoque_le } : {}),
});

/** Requêtes paramétrées uniquement (gabarits `sql`), jamais de SQL construit par concaténation. */
export class DepotPostgres implements DepotInvitations {
  constructor(private readonly sql: Sql) {}

  async creerSousQuota(
    i: Invitation,
    quota: number,
  ): Promise<'cree' | 'quota-atteint' | 'doublon'> {
    return this.sql.begin(async (tx) => {
      // Un verrou par cohorte sérialise les créations : le comptage et l'insertion restent cohérents.
      await tx`select pg_advisory_xact_lock(hashtext(${`mbolo-invitations:${i.cohorte}`}))`;
      const [compte] = await tx<{ n: number }[]>`
        select count(*)::int as n from invitations.codes where cohorte = ${i.cohorte}`;
      if ((compte?.n ?? 0) >= quota) return 'quota-atteint' as const;
      const inserees = await tx`
        insert into invitations.codes (id, empreinte, cohorte, cree_par, cree_le, expire_le)
        values (${i.id}, ${i.empreinte}, ${i.cohorte}, ${i.creePar}, ${i.creeLe}, ${i.expireLe})
        on conflict (empreinte) do nothing`;
      return inserees.count === 1 ? ('cree' as const) : ('doublon' as const);
    });
  }

  async trouver(empreinte: Buffer): Promise<Invitation | undefined> {
    const [l] = await this.sql<Ligne[]>`
      select * from invitations.codes where empreinte = ${empreinte}`;
    return l ? versInvitation(l) : undefined;
  }

  async utiliser(
    empreinte: Buffer,
    sujet: string,
    maintenant: Date,
  ): Promise<Invitation | undefined> {
    const [l] = await this.sql<Ligne[]>`
      update invitations.codes
         set utilise_le = ${maintenant}, utilise_par = ${sujet}
       where empreinte = ${empreinte}
         and utilise_le is null and revoque_le is null and expire_le > ${maintenant}
      returning *`;
    return l ? versInvitation(l) : undefined;
  }

  async revoquer(id: string, maintenant: Date): Promise<boolean> {
    const r = await this.sql`
      update invitations.codes set revoque_le = ${maintenant}
       where id = ${id} and utilise_le is null and revoque_le is null`;
    return r.count === 1;
  }

  async lister(cohorte: string, limite: number): Promise<Invitation[]> {
    const lignes = await this.sql<Ligne[]>`
      select * from invitations.codes where cohorte = ${cohorte}
       order by cree_le desc limit ${limite}`;
    return lignes.map(versInvitation);
  }

  async creerPourProche(
    i: Invitation,
    max: number,
    maintenant: Date,
    parJour: { max: number; depuis: Date },
  ): Promise<'cree' | 'limite-atteinte' | 'limite-jour' | 'doublon'> {
    return this.sql.begin(async (tx) => {
      // Un verrou par patient : le comptage et l'insertion restent cohérents.
      await tx`select pg_advisory_xact_lock(hashtext(${`mbolo-proches:${i.creePar}`}))`;
      const [jour] = await tx<{ n: number }[]>`
        select count(*)::int as n from invitations.codes
         where cree_par = ${i.creePar} and type = 'proche' and cree_le > ${parJour.depuis}`;
      if ((jour?.n ?? 0) >= parJour.max) return 'limite-jour' as const;
      const [compte] = await tx<{ n: number }[]>`
        select count(*)::int as n from invitations.codes
         where cree_par = ${i.creePar} and type = 'proche' and revoque_le is null
           and (utilise_le is not null or expire_le > ${maintenant})`;
      if ((compte?.n ?? 0) >= max) return 'limite-atteinte' as const;
      const inserees = await tx`
        insert into invitations.codes
          (id, empreinte, cohorte, type, related_person_id, cree_par, cree_le, expire_le)
        values (${i.id}, ${i.empreinte}, ${i.cohorte}, 'proche', ${i.relatedPersonId ?? null},
                ${i.creePar}, ${i.creeLe}, ${i.expireLe})
        on conflict (empreinte) do nothing`;
      return inserees.count === 1 ? ('cree' as const) : ('doublon' as const);
    });
  }

  async listerProches(creePar: string): Promise<Invitation[]> {
    const lignes = await this.sql<Ligne[]>`
      select * from invitations.codes where cree_par = ${creePar} and type = 'proche'
       order by cree_le desc limit 50`;
    return lignes.map(versInvitation);
  }

  async revoquerProche(id: string, creePar: string, maintenant: Date): Promise<boolean> {
    const r = await this.sql`
      update invitations.codes set revoque_le = ${maintenant}
       where id = ${id} and cree_par = ${creePar} and type = 'proche' and revoque_le is null`;
    return r.count === 1;
  }

  async parFiche(relatedPersonId: string): Promise<Invitation | undefined> {
    const [l] = await this.sql<Ligne[]>`
      select * from invitations.codes
       where related_person_id = ${relatedPersonId} and type = 'proche'
       order by cree_le desc limit 1`;
    return l ? versInvitation(l) : undefined;
  }

  async revoquerParFiche(relatedPersonId: string, maintenant: Date): Promise<boolean> {
    const r = await this.sql`
      update invitations.codes set revoque_le = ${maintenant}
       where related_person_id = ${relatedPersonId} and type = 'proche' and revoque_le is null`;
    return r.count > 0;
  }

  async creerRecuperation(i: Invitation, maintenant: Date): Promise<'cree' | 'doublon'> {
    return this.sql.begin(async (tx) => {
      // Un verrou par dossier : deux créations simultanées ne laissent qu'un code valable.
      await tx`select pg_advisory_xact_lock(hashtext(${`mbolo-recuperation:${i.patientId ?? ''}`}))`;
      await tx`
        update invitations.codes set revoque_le = ${maintenant}
         where type = 'recuperation' and patient_id = ${i.patientId ?? null}
           and utilise_le is null and revoque_le is null`;
      const inserees = await tx`
        insert into invitations.codes
          (id, empreinte, cohorte, type, patient_id, cree_par, cree_le, expire_le)
        values (${i.id}, ${i.empreinte}, ${i.cohorte}, 'recuperation', ${i.patientId ?? null},
                ${i.creePar}, ${i.creeLe}, ${i.expireLe})
        on conflict (empreinte) do nothing`;
      return inserees.count === 1 ? ('cree' as const) : ('doublon' as const);
    });
  }
}
