// Relevés mensuels des intervenants (ADR-0020, flag reversements.professionnels), en lecture seule :
// pour chaque professionnel, les consultations payées dans le mois, les remboursements versés dans
// le mois, et le montant qui lui reviendrait. **Rien n'est versé ici** : le versement, validé par un
// humain avec les coordonnées de versement vérifiées, viendra dans une PR suivante.
// - Réservé au rôle validation-reversement (double authentification), jamais un agent IA.
// - Aucune donnée de santé : références opaques du professionnel et des rendez-vous, montants.
// - La part reversée est un paramètre du déploiement (hypothèse du business plan : 55 %), en attente
//   du juriste (partage d'honoraires, ADR-0020 question 1) et du porteur de projet (question 11).
import type { Sql } from '@mbolo/base-donnees';
import type { Drapeaux } from '@mbolo/drapeaux';
import type { Utilisateur } from '@mbolo/identite';
import type { DepotPaiements } from './depot.js';

export const ROLE_REVERSEMENT = 'validation-reversement';

/** Lignes brutes d'un mois, par professionnel (paiements reçus et remboursements versés). */
export interface LigneReleve {
  praticien: string;
  devise: string;
  consultations: number;
  encaisse: number;
  remboursements: number;
  rembourse: number;
}

export interface DepotReleves {
  /** Paiements reçus et remboursements versés dans [debut, fin[, regroupés par professionnel. */
  duMois(debut: Date, fin: Date): Promise<LigneReleve[]>;
}

/** Dépôt en mémoire (tests), sur le dépôt en mémoire des paiements. */
export class DepotRelevesMemoire implements DepotReleves {
  constructor(
    private readonly depot: Pick<DepotPaiements, 'trouver'> & {
      paiements: readonly {
        id: string;
        praticien?: string;
        statut: string;
        payeLe?: Date;
        montant: number;
        devise: string;
      }[];
      remboursementsEnMemoire: readonly {
        paiementId: string;
        statut: string;
        effectueLe?: Date;
        montant: number;
      }[];
    },
  ) {}

  async duMois(debut: Date, fin: Date): Promise<LigneReleve[]> {
    const dans = (d?: Date) => !!d && d >= debut && d < fin;
    const lignes = new Map<string, LigneReleve>();
    const ligne = (praticien: string, devise: string) => {
      const cle = `${praticien}|${devise}`;
      let l = lignes.get(cle);
      if (!l) {
        l = { praticien, devise, consultations: 0, encaisse: 0, remboursements: 0, rembourse: 0 };
        lignes.set(cle, l);
      }
      return l;
    };
    for (const p of this.depot.paiements) {
      if (p.praticien && p.statut === 'paye' && dans(p.payeLe)) {
        const l = ligne(p.praticien, p.devise);
        l.consultations += 1;
        l.encaisse += p.montant;
      }
    }
    for (const r of this.depot.remboursementsEnMemoire) {
      if (r.statut !== 'effectue' || !dans(r.effectueLe)) continue;
      const p = this.depot.paiements.find((x) => x.id === r.paiementId);
      if (!p?.praticien) continue;
      const l = ligne(p.praticien, p.devise);
      l.remboursements += 1;
      l.rembourse += r.montant;
    }
    return [...lignes.values()];
  }
}

/** Requêtes paramétrées uniquement. */
export class DepotRelevesPostgres implements DepotReleves {
  constructor(private readonly sql: Sql) {}

  async duMois(debut: Date, fin: Date): Promise<LigneReleve[]> {
    const lignes = await this.sql<
      {
        praticien: string;
        devise: string;
        consultations: number;
        encaisse: string;
        remboursements: number;
        rembourse: string;
      }[]
    >`
      with payes as (
        select praticien, devise, count(*)::int as consultations, sum(montant) as encaisse
          from paiement.paiements
         where statut = 'paye' and praticien is not null
           and paye_le >= ${debut} and paye_le < ${fin}
         group by praticien, devise
      ), rembourses as (
        select p.praticien, p.devise, count(*)::int as remboursements, sum(r.montant) as rembourse
          from paiement.remboursements r join paiement.paiements p on p.id = r.paiement_id
         where r.statut = 'effectue' and p.praticien is not null
           and r.effectue_le >= ${debut} and r.effectue_le < ${fin}
         group by p.praticien, p.devise
      )
      select coalesce(a.praticien, b.praticien) as praticien,
             coalesce(a.devise, b.devise) as devise,
             coalesce(a.consultations, 0) as consultations,
             coalesce(a.encaisse, 0) as encaisse,
             coalesce(b.remboursements, 0) as remboursements,
             coalesce(b.rembourse, 0) as rembourse
        from payes a full join rembourses b on a.praticien = b.praticien and a.devise = b.devise
       order by 1, 2`;
    return lignes.map((l) => ({
      praticien: l.praticien,
      devise: l.devise,
      consultations: l.consultations,
      // bigint lu comme texte par le pilote : montants entiers sûrs (vérifiés à la grille).
      encaisse: Number(l.encaisse),
      remboursements: l.remboursements,
      rembourse: Number(l.rembourse),
    }));
  }
}

export interface ParametresReleves {
  /** Part reversée au professionnel, en pourcentage entier (hypothèse du business plan : 55). */
  partPourcent: number;
  /** Fuseau du pays : un mois commence et finit à minuit dans le pays, pas en UTC. */
  fuseau: string;
}

export interface Releve {
  praticien: string;
  devise: string;
  consultations: number;
  encaisse: number;
  remboursements: number;
  rembourse: number;
  /** Encaissé moins remboursé, dans le mois. */
  net: number;
  /** Part du professionnel sur le net, arrondie à l'unité inférieure ; jamais négative. */
  aReverser: number;
  /** Net négatif (remboursements d'un mois précédent) : à déduire du relevé suivant. */
  aDeduire: number;
}

export class ErreurReleves extends Error {
  constructor(readonly motif: 'interdit' | 'desactive' | 'mois') {
    super(
      motif === 'desactive'
        ? 'Les relevés ne sont pas encore ouverts.'
        : motif === 'mois'
          ? 'Mois invalide (AAAA-MM, mois terminé ou en cours).'
          : 'Accès refusé.',
    );
  }
}

/** Décalage du fuseau par rapport à UTC à cet instant, en millisecondes. */
function decalage(fuseau: string, instant: Date): number {
  const parties = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const v = (t: string) => Number(parties.find((p) => p.type === t)?.value);
  const local = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return local - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Minuit du 1er jour du mois dans le fuseau du pays, en instant UTC. */
export function debutDuMois(annee: number, mois: number, fuseau: string): Date {
  const approx = new Date(Date.UTC(annee, mois - 1, 1));
  return new Date(approx.getTime() - decalage(fuseau, approx));
}

export class ServiceReleves {
  constructor(
    private readonly depot: DepotReleves,
    private readonly drapeaux: Pick<Drapeaux, 'estActif'>,
    private readonly parametres: ParametresReleves,
    private readonly horloge: () => Date = () => new Date(),
  ) {
    const p = parametres.partPourcent;
    if (!Number.isInteger(p) || p < 1 || p > 100) {
      throw new Error('Part reversée invalide (pourcentage entier de 1 à 100).');
    }
    new Intl.DateTimeFormat('en', { timeZone: parametres.fuseau });
  }

  /** Relevés d'un mois (AAAA-MM), pour le rôle validation-reversement seulement. */
  async duMois(u: Utilisateur, mois: string): Promise<Releve[]> {
    if (
      !(u.roles as readonly string[]).includes(ROLE_REVERSEMENT) ||
      u.agent ||
      (u.roles as readonly string[]).includes('agent-ia')
    ) {
      throw new ErreurReleves('interdit');
    }
    if (
      !(await this.drapeaux.estActif('reversements.professionnels', {
        sujet: u.sujet,
        typeUtilisateur: ROLE_REVERSEMENT,
      }))
    ) {
      throw new ErreurReleves('desactive');
    }
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mois);
    if (!m) throw new ErreurReleves('mois');
    const annee = Number(m[1]);
    const numero = Number(m[2]);
    const debut = debutDuMois(annee, numero, this.parametres.fuseau);
    const fin = debutDuMois(
      numero === 12 ? annee + 1 : annee,
      numero === 12 ? 1 : numero + 1,
      this.parametres.fuseau,
    );
    if (debut > this.horloge()) throw new ErreurReleves('mois');
    return (await this.depot.duMois(debut, fin)).map((l) => {
      const net = l.encaisse - l.rembourse;
      return {
        ...l,
        net,
        aReverser: net > 0 ? Math.floor((net * this.parametres.partPourcent) / 100) : 0,
        aDeduire: net < 0 ? Math.floor((-net * this.parametres.partPourcent) / 100) : 0,
      };
    });
  }
}
