// Stockage des invitations : interface commune, dépôt en mémoire (tests) et dépôt PostgreSQL (ADR-0013).
import type { Sql } from '@mbolo/base-donnees';

export interface Invitation {
  id: string;
  empreinte: Buffer;
  cohorte: string;
  /** Identifiant Keycloak opaque (sub) du créateur. */
  creePar: string;
  creeLe: Date;
  expireLe: Date;
  utiliseLe?: Date;
  utilisePar?: string;
  revoqueLe?: Date;
}

export type Statut = 'valide' | 'utilise' | 'revoque' | 'expire';

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
}

interface Ligne {
  id: string;
  empreinte: Buffer;
  cohorte: string;
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
}
