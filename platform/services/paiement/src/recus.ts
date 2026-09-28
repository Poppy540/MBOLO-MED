// Reçus et avoirs du patient (ADR-0020, flag facturation.recus).
// - Un reçu à chaque paiement reçu, un avoir à chaque remboursement versé ; un seul de chaque par
//   paiement (idempotent : un nouvel essai rend celui qui existe).
// - Numérotation continue et sans trou par pays et par année (ex. GA-2026-000001 [FICTIF]) : le
//   compteur et le reçu sont écrits dans la même transaction.
// - Aucune donnée de santé : libellé neutre, référence opaque du rendez-vous, opérateur sans numéro.
// - Pas encore de ventilation honoraires / frais de service, ni de taxes : en attente du juriste et du
//   comptable (ADR-0020, questions 1, 3, 5 et 11). Le reçu porte la mention « sans valeur fiscale »
//   tant que les mentions de l'émetteur ne sont pas validées.
import type { Sql } from '@mbolo/base-donnees';
import type { Drapeaux } from '@mbolo/drapeaux';
import type { Utilisateur } from '@mbolo/identite';
import type { DepotPaiements, Paiement } from './depot.js';
import { LIBELLE } from './fournisseur.js';

export type TypeRecu = 'recu' | 'avoir';

export interface Recu {
  numero: string;
  type: TypeRecu;
  paiementId: string;
  montant: number;
  devise: string;
  emisLe: Date;
}

export interface DepotRecus {
  /**
   * Émet le reçu (ou l'avoir) d'un paiement dans la série donnée, sous verrou ; rend celui qui existe
   * déjà s'il a été émis (le numéro n'est alors pas consommé).
   */
  emettre(r: Omit<Recu, 'numero'>, serie: string): Promise<{ recu: Recu; nouveau: boolean }>;
  duPaiement(paiementId: string): Promise<Recu[]>;
  /** Reçus et avoirs des paiements de ce patient, les plus récents d'abord. */
  duPatient(sujet: string): Promise<Recu[]>;
  /**
   * Reçus manquants (rattrapage périodique) : paiement reçu sans reçu, remboursement versé sans
   * avoir (une émission interrompue est reprise au passage suivant).
   */
  manquants(limite: number): Promise<{ paiementId: string; type: TypeRecu }[]>;
}

export const numeroRecu = (serie: string, n: number): string =>
  `${serie}-${String(n).padStart(6, '0')}`;

/** Dépôt en mémoire (tests) ; les paiements viennent du dépôt en mémoire des paiements. */
export class DepotRecusMemoire implements DepotRecus {
  readonly recus: Recu[] = [];
  private readonly compteurs = new Map<string, number>();

  constructor(
    private readonly paiements: {
      paiements: readonly Paiement[];
      remboursementsEnMemoire: readonly { paiementId: string; statut: string }[];
    },
  ) {}

  async manquants(limite: number) {
    const a = (id: string, t: TypeRecu) =>
      this.recus.some((x) => x.paiementId === id && x.type === t);
    return [
      ...this.paiements.paiements
        .filter((p) => p.statut === 'paye' && !a(p.id, 'recu'))
        .map((p) => ({ paiementId: p.id, type: 'recu' as const })),
      ...this.paiements.remboursementsEnMemoire
        .filter((r) => r.statut === 'effectue' && !a(r.paiementId, 'avoir'))
        .map((r) => ({ paiementId: r.paiementId, type: 'avoir' as const })),
    ].slice(0, limite);
  }

  async emettre(r: Omit<Recu, 'numero'>, serie: string) {
    const existant = this.recus.find((x) => x.paiementId === r.paiementId && x.type === r.type);
    if (existant) return { recu: { ...existant }, nouveau: false };
    const n = (this.compteurs.get(serie) ?? 0) + 1;
    this.compteurs.set(serie, n);
    const recu = { ...r, numero: numeroRecu(serie, n) };
    this.recus.push(recu);
    return { recu: { ...recu }, nouveau: true };
  }

  async duPaiement(paiementId: string): Promise<Recu[]> {
    return this.recus.filter((x) => x.paiementId === paiementId).map((x) => ({ ...x }));
  }

  async duPatient(sujet: string): Promise<Recu[]> {
    const ids = new Set(this.paiements.paiements.filter((p) => p.sujet === sujet).map((p) => p.id));
    return this.recus
      .filter((x) => ids.has(x.paiementId))
      .sort((a, b) => b.emisLe.getTime() - a.emisLe.getTime())
      .map((x) => ({ ...x }));
  }
}

interface LigneRecu {
  numero: string;
  type: TypeRecu;
  paiement_id: string;
  montant: string;
  devise: string;
  emis_le: Date;
}

const versRecu = (l: LigneRecu): Recu => ({
  numero: l.numero,
  type: l.type,
  paiementId: l.paiement_id,
  montant: Number(l.montant),
  devise: l.devise,
  emisLe: l.emis_le,
});

/** Requêtes paramétrées uniquement. */
export class DepotRecusPostgres implements DepotRecus {
  constructor(private readonly sql: Sql) {}

  async emettre(r: Omit<Recu, 'numero'>, serie: string) {
    return this.sql.begin(async (tx) => {
      // Verrou par paiement : deux émissions simultanées ne consomment pas deux numéros.
      await tx`select pg_advisory_xact_lock(hashtext(${`mbolo-recus:${r.paiementId}`}))`;
      const [existant] = await tx<LigneRecu[]>`
        select * from paiement.recus where paiement_id = ${r.paiementId} and type = ${r.type}`;
      if (existant) return { recu: versRecu(existant), nouveau: false };
      // Le compteur (ligne verrouillée jusqu'à la fin) et le reçu sont validés ensemble : sans trou.
      const [compteur] = await tx<{ dernier: string }[]>`
        insert into paiement.compteurs_recus (serie, dernier) values (${serie}, 1)
        on conflict (serie) do update set dernier = paiement.compteurs_recus.dernier + 1
        returning dernier`;
      const numero = numeroRecu(serie, Number(compteur?.dernier));
      const [l] = await tx<LigneRecu[]>`
        insert into paiement.recus (numero, type, paiement_id, montant, devise, emis_le)
        values (${numero}, ${r.type}, ${r.paiementId}, ${r.montant}, ${r.devise}, ${r.emisLe})
        returning *`;
      if (!l) throw new Error('Reçu non enregistré.');
      return { recu: versRecu(l), nouveau: true };
    });
  }

  async duPaiement(paiementId: string): Promise<Recu[]> {
    const lignes = await this.sql<LigneRecu[]>`
      select * from paiement.recus where paiement_id = ${paiementId} order by emis_le`;
    return lignes.map(versRecu);
  }

  async manquants(limite: number) {
    return this.sql<{ paiementId: string; type: TypeRecu }[]>`
      select p.id as "paiementId", 'recu' as type from paiement.paiements p
       where p.statut = 'paye'
         and not exists (select 1 from paiement.recus r where r.paiement_id = p.id and r.type = 'recu')
      union all
      select m.paiement_id as "paiementId", 'avoir' as type from paiement.remboursements m
       where m.statut = 'effectue'
         and not exists (select 1 from paiement.recus r
                          where r.paiement_id = m.paiement_id and r.type = 'avoir')
      limit ${limite}`;
  }

  async duPatient(sujet: string): Promise<Recu[]> {
    const lignes = await this.sql<LigneRecu[]>`
      select r.* from paiement.recus r join paiement.paiements p on p.id = r.paiement_id
       where p.sujet = ${sujet} order by r.emis_le desc limit 200`;
    return lignes.map(versRecu);
  }
}

/** Émetteur et série, propres au pays déployé (jamais codés en dur). */
export interface ParametresRecus {
  /** Code pays ISO 3166-1 alpha-2 de la série, ex. GA. */
  pays: string;
  /** Fuseau du pays : l'année de la série est celle du pays au moment de l'émission. */
  fuseau: string;
  /** Nom et mentions de l'émetteur, tels que validés par le juriste (brouillon en attendant). */
  emetteur: { nom: string; mentions: string };
  /** Tant que le juriste et le comptable n'ont pas validé les mentions : « sans valeur fiscale ». */
  valeurFiscale: boolean;
}

export function verifierParametresRecus(p: ParametresRecus): ParametresRecus {
  if (!/^[A-Z]{2}$/.test(p.pays)) throw new Error('Pays des reçus invalide (ISO 3166-1, ex. GA).');
  try {
    new Intl.DateTimeFormat('en', { timeZone: p.fuseau });
  } catch {
    throw new Error(`Fuseau des reçus invalide : ${p.fuseau}.`);
  }
  if (!p.emetteur.nom.trim()) throw new Error('Nom de l’émetteur des reçus manquant.');
  return p;
}

/** Ce que voit le patient : aucun numéro de téléphone, aucune donnée de santé. */
export interface VueRecu {
  numero: string;
  type: TypeRecu;
  libelle: string;
  montant: number;
  devise: string;
  emisLe: string;
  /** Référence opaque du rendez-vous. */
  reference: string;
  operateur?: string;
  /** Pour un avoir : numéro du reçu annulé. */
  recuAnnule?: string;
  emetteur: { nom: string; mentions: string };
  valeurFiscale: boolean;
}

export class ErreurRecus extends Error {
  constructor(readonly motif: 'desactive' | 'interdit') {
    super(motif === 'desactive' ? 'Les reçus ne sont pas encore disponibles.' : 'Accès refusé.');
  }
}

export class ServiceRecus {
  constructor(
    private readonly depot: DepotRecus,
    private readonly paiements: Pick<DepotPaiements, 'trouver'>,
    private readonly drapeaux: Pick<Drapeaux, 'estActif'>,
    private readonly parametres: ParametresRecus,
    private readonly horloge: () => Date = () => new Date(),
  ) {
    verifierParametresRecus(parametres);
  }

  private serie(d: Date): string {
    const annee = new Intl.DateTimeFormat('en', {
      timeZone: this.parametres.fuseau,
      year: 'numeric',
    }).format(d);
    return `${this.parametres.pays}-${annee}`;
  }

  private actif(sujet: string): Promise<boolean> {
    return this.drapeaux.estActif('facturation.recus', { sujet, typeUtilisateur: 'patient' });
  }

  /**
   * Émet le reçu d'un paiement reçu, ou l'avoir d'un paiement remboursé ; sans effet si la fonction
   * n'est pas ouverte pour ce patient ou si le paiement n'est pas dans le bon état.
   */
  async emettre(p: Paiement, type: TypeRecu): Promise<Recu | undefined> {
    if (p.statut !== 'paye' || !(await this.actif(p.sujet))) return undefined;
    // Pas d'avoir sans reçu : le reçu est émis d'abord s'il manque.
    if (type === 'avoir') await this.emettre(p, 'recu');
    const maintenant = this.horloge();
    const { recu } = await this.depot.emettre(
      { type, paiementId: p.id, montant: p.montant, devise: p.devise, emisLe: maintenant },
      this.serie(maintenant),
    );
    return recu;
  }

  /** Rattrapage : émet les reçus et avoirs manquants ; rend le nombre émis. */
  async rattraper(): Promise<number> {
    let n = 0;
    for (const m of await this.depot.manquants(200)) {
      const p = await this.paiements.trouver(m.paiementId);
      if (p && (await this.emettre(p, m.type))) n += 1;
    }
    return n;
  }

  /** Reçus et avoirs du patient lui-même (jamais un agent IA ni un autre compte). */
  async lister(u: Utilisateur): Promise<VueRecu[]> {
    if (u.agent || (u.roles as readonly string[]).includes('agent-ia')) {
      throw new ErreurRecus('interdit');
    }
    if (!u.roles.includes('patient')) throw new ErreurRecus('interdit');
    if (!(await this.actif(u.sujet))) throw new ErreurRecus('desactive');
    const recus = await this.depot.duPatient(u.sujet);
    const paiements = new Map<string, Paiement | undefined>();
    const vues: VueRecu[] = [];
    for (const r of recus) {
      if (!paiements.has(r.paiementId)) {
        paiements.set(r.paiementId, await this.paiements.trouver(r.paiementId));
      }
      const p = paiements.get(r.paiementId);
      const annule =
        r.type === 'avoir'
          ? recus.find((x) => x.paiementId === r.paiementId && x.type === 'recu')
          : undefined;
      vues.push({
        numero: r.numero,
        type: r.type,
        libelle: r.type === 'recu' ? LIBELLE : `Remboursement — ${LIBELLE}`,
        montant: r.montant,
        devise: r.devise,
        emisLe: r.emisLe.toISOString(),
        reference: p?.reference ?? '',
        ...(p?.operateur ? { operateur: p.operateur } : {}),
        ...(annule ? { recuAnnule: annule.numero } : {}),
        emetteur: this.parametres.emetteur,
        valeurFiscale: this.parametres.valeurFiscale,
      });
    }
    return vues;
  }
}
