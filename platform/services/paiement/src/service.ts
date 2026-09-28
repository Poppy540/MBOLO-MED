// Logique du paiement (ADR-0017).
// - Le paiement est créé par le service de téléconsultation pour un rendez-vous : le montant vient de
//   la grille du pays, jamais du navigateur.
// - Le patient lance la collecte depuis un portefeuille (le sien ou celui d'un proche) : le numéro va
//   au prestataire et n'est jamais conservé.
// - Un paiement n'est « payé » que si le prestataire le confirme quand on relit son statut.
// - Un agent IA ne déclenche jamais un paiement (principe n°7).
// - Rendez-vous annulé mais payé : la plateforme prépare le remboursement ; seul un humain (rôle
//   validation-remboursement, jamais un agent IA ni le patient concerné) le valide ou le refuse.
import { randomUUID } from 'node:crypto';
import type { Drapeaux } from '@mbolo/drapeaux';
import type { Utilisateur } from '@mbolo/identite';
import type {
  DepotPaiements,
  Paiement,
  Remboursement,
  Statut,
  StatutRemboursement,
} from './depot.js';
import { LIBELLE, type Fournisseur } from './fournisseur.js';
import { normaliserNumero, type Tarifs, type TypeConsultation } from './tarifs.js';

export type MotifErreur =
  | 'desactive'
  | 'introuvable'
  | 'interdit'
  | 'numero'
  | 'operateur'
  | 'deja-en-cours'
  | 'deja-paye'
  | 'annule'
  | 'deja-decide';

export const ROLE_VALIDATION = 'validation-remboursement';

/** Ce que voit le valideur : montant et dates, jamais le patient ni le numéro. */
export interface VueRemboursement {
  id: string;
  statut: StatutRemboursement;
  montant: number;
  devise: string;
  prepareLe: string;
  /** Référence opaque du rendez-vous annulé. */
  reference: string;
  operateur?: string;
}

/** Bilan d'un rapprochement. */
export interface BilanRapprochement {
  /** Collectes en attente relues chez le prestataire. */
  relues: number;
  /** Remboursements préparés (paiement reçu pour un rendez-vous annulé). */
  prepares: number;
  /** Remboursements validés puis exécutés. */
  effectues: number;
  /** Prestataire injoignable : repris au passage suivant. */
  erreurs: number;
}

export class ErreurPaiement extends Error {
  constructor(
    readonly motif: MotifErreur,
    message: string,
  ) {
    super(message);
  }
}

/** Ce que voit le patient : jamais le prestataire, la tentative ni le compte d'un autre. */
export interface VuePaiement {
  id: string;
  statut: Statut;
  montant: number;
  devise: string;
  operateur?: string;
}

const vue = (p: Paiement): VuePaiement => ({
  id: p.id,
  statut: p.statut,
  montant: p.montant,
  devise: p.devise,
  ...(p.operateur ? { operateur: p.operateur } : {}),
});

export const estAgent = (u: Utilisateur): boolean =>
  Boolean(u.agent) || (u.roles as readonly string[]).includes('agent-ia');

export class ServicePaiement {
  constructor(
    private readonly depot: DepotPaiements,
    private readonly fournisseur: Fournisseur,
    private readonly tarifs: Tarifs,
    private readonly drapeaux: Pick<Drapeaux, 'estActif'>,
    private readonly horloge: () => Date = () => new Date(),
    /** Prévient les valideurs qu'un remboursement attend leur décision (alerte). */
    private readonly surRemboursement: (r: Remboursement) => void = () => undefined,
  ) {}

  private async verifierActif(sujet: string): Promise<void> {
    const actif = await this.drapeaux.estActif('paiement.mobile-money', {
      sujet,
      typeUtilisateur: 'patient',
    });
    if (!actif)
      throw new ErreurPaiement('desactive', 'Le paiement en ligne n’est pas encore ouvert.');
  }

  /** Appelé par le service de téléconsultation (jeton de service) ; idempotent par rendez-vous. */
  async creer(d: {
    reference: string;
    sujet: string;
    type: TypeConsultation;
  }): Promise<{ id: string; statut: Statut; montant: number; devise: string }> {
    await this.verifierActif(d.sujet);
    const maintenant = this.horloge();
    const p = await this.depot.creer({
      id: randomUUID(),
      reference: d.reference,
      sujet: d.sujet,
      typeConsultation: d.type,
      montant: this.tarifs.prix[d.type],
      devise: this.tarifs.devise,
      statut: 'a-payer',
      creeLe: maintenant,
      misAJourLe: maintenant,
    });
    // Une même référence ne change jamais de patient.
    if (p.sujet !== d.sujet) throw new ErreurPaiement('interdit', 'Référence déjà utilisée.');
    return { id: p.id, statut: p.statut, montant: p.montant, devise: p.devise };
  }

  /** Statut pour le service de téléconsultation : payé ou non, rien d'autre. */
  async estPaye(reference: string): Promise<boolean> {
    const p = await this.depot.trouverParReference(reference);
    if (!p) return false;
    return (await this.actualiser(p)).statut === 'paye';
  }

  /** Le patient ne voit que ses propres paiements ; celui d'un autre est « introuvable ». */
  private async duPatient(u: Utilisateur, id: string): Promise<Paiement> {
    if (estAgent(u)) throw new ErreurPaiement('interdit', 'Accès refusé.');
    const p = await this.depot.trouver(id);
    if (!p || p.sujet !== u.sujet) throw new ErreurPaiement('introuvable', 'Paiement introuvable.');
    return p;
  }

  async lire(u: Utilisateur, id: string): Promise<VuePaiement> {
    return vue(await this.actualiser(await this.duPatient(u, id)));
  }

  async collecter(
    u: Utilisateur,
    id: string,
    d: { operateur: string; numero: string },
  ): Promise<VuePaiement> {
    const p = await this.duPatient(u, id);
    await this.verifierActif(u.sujet);
    if (!this.tarifs.operateurs.includes(d.operateur)) {
      throw new ErreurPaiement('operateur', 'Opérateur non proposé.');
    }
    const numero = normaliserNumero(d.numero, this.tarifs.indicatif);
    if (!numero) {
      throw new ErreurPaiement('numero', `Numéro invalide (format +${this.tarifs.indicatif}…).`);
    }
    if (p.statut === 'paye') throw new ErreurPaiement('deja-paye', 'Ce rendez-vous est déjà payé.');
    if (p.annuleLe) throw new ErreurPaiement('annule', 'Ce rendez-vous a été annulé.');

    const tentative = randomUUID();
    const demarre = await this.depot.demarrer(
      p.id,
      { tentative, operateur: d.operateur, fournisseur: this.fournisseur.nom },
      this.horloge(),
    );
    if (!demarre) {
      // Annulé entre-temps (la mise à jour conditionnelle l'exclut) ou collecte déjà en cours.
      const actuel = await this.depot.trouver(p.id);
      if (actuel?.annuleLe) throw new ErreurPaiement('annule', 'Ce rendez-vous a été annulé.');
      throw new ErreurPaiement('deja-en-cours', 'Un paiement est déjà en cours de validation.');
    }
    try {
      await this.fournisseur.initier({
        tentative,
        montant: p.montant,
        devise: p.devise,
        operateur: d.operateur,
        numero,
        libelle: LIBELLE,
      });
    } catch (e) {
      // Rien n'a été demandé au payeur : la tentative échoue, le patient peut réessayer.
      await this.depot.conclure(tentative, 'echoue', this.horloge());
      throw e;
    }
    return vue(demarre);
  }

  /**
   * Notification du prestataire : signature vérifiée, puis statut relu chez le prestataire.
   * Renvoie le paiement mis à jour, `undefined` si la notification est refusée ou sans effet.
   */
  async notification(
    corps: Buffer,
    entetes: Record<string, string | string[] | undefined>,
  ): Promise<{ accepte: boolean; paiement?: Paiement }> {
    const tentative = this.fournisseur.verifierNotification(corps, entetes, this.horloge());
    if (!tentative) return { accepte: false };
    const p = await this.depot.trouverParTentative(tentative);
    if (!p) return { accepte: true };
    const apres = await this.actualiser(p);
    return { accepte: true, paiement: apres };
  }

  /** Tentative en attente d'un paiement (simulation du payeur en développement seulement). */
  async tentativeEnAttente(id: string): Promise<string | undefined> {
    const p = await this.depot.trouver(id);
    return p?.statut === 'en-attente' ? p.tentative : undefined;
  }

  /** Relit le statut chez le prestataire tant que la collecte est en attente. */
  private async rafraichir(p: Paiement): Promise<Paiement> {
    if (p.statut !== 'en-attente' || !p.tentative) return p;
    const r = await this.fournisseur.statut(p.tentative);
    if (r === 'en-attente') return p;
    const conclu = await this.depot.conclure(
      p.tentative,
      r === 'reussi' ? 'paye' : 'echoue',
      this.horloge(),
    );
    // Conclu entre-temps par une autre requête : relire l'état enregistré.
    return conclu ?? (await this.depot.trouver(p.id)) ?? p;
  }

  /** Relit le statut, puis prépare le remboursement si le rendez-vous est annulé. */
  private async actualiser(p: Paiement): Promise<Paiement> {
    const apres = await this.rafraichir(p);
    await this.preparerSiNecessaire(apres);
    return apres;
  }

  /** Paiement reçu pour un rendez-vous annulé : remboursement préparé (une seule fois). */
  private async preparerSiNecessaire(p: Paiement): Promise<boolean> {
    if (p.statut !== 'paye' || !p.annuleLe) return false;
    const r = await this.depot.preparerRemboursement({
      id: randomUUID(),
      paiementId: p.id,
      montant: p.montant,
      devise: p.devise,
      statut: 'a-valider',
      prepareLe: this.horloge(),
    });
    if (r) this.surRemboursement(r);
    return Boolean(r);
  }

  /**
   * Le service de téléconsultation signale l'annulation d'un rendez-vous (jeton de service) : plus
   * aucune collecte ; si le paiement est déjà reçu, ou arrive plus tard, le remboursement est préparé.
   */
  async annulationRendezVous(reference: string): Promise<{ connu: boolean; aRembourser: boolean }> {
    const p = await this.depot.annuler(reference, this.horloge());
    if (!p) return { connu: false, aRembourser: false };
    const apres = await this.actualiser(p);
    return { connu: true, aRembourser: apres.statut === 'paye' };
  }

  /**
   * Rapprochement périodique avec le prestataire : collectes en attente relues, paiements reçus pour
   * un rendez-vous annulé mis en remboursement, remboursements validés exécutés. Une erreur du
   * prestataire ne bloque pas les autres : elle est reprise au passage suivant.
   */
  async rapprocher(): Promise<BilanRapprochement> {
    const bilan: BilanRapprochement = { relues: 0, prepares: 0, effectues: 0, erreurs: 0 };
    for (const p of await this.depot.enAttente()) {
      try {
        await this.rafraichir(p);
        bilan.relues += 1;
      } catch {
        bilan.erreurs += 1;
      }
    }
    for (const p of await this.depot.payesAnnulesSansRemboursement()) {
      if (await this.preparerSiNecessaire(p)) bilan.prepares += 1;
    }
    for (const r of await this.depot.remboursements('valide')) {
      try {
        if (await this.executer(r)) bilan.effectues += 1;
      } catch {
        bilan.erreurs += 1;
      }
    }
    return bilan;
  }

  private exigerValideur(u: Utilisateur): void {
    if (!u.roles.includes(ROLE_VALIDATION) || estAgent(u)) {
      throw new ErreurPaiement('interdit', 'Accès refusé.');
    }
  }

  private async vueRemboursement(r: Remboursement): Promise<VueRemboursement> {
    const p = await this.depot.trouver(r.paiementId);
    return {
      id: r.id,
      statut: r.statut,
      montant: r.montant,
      devise: r.devise,
      prepareLe: r.prepareLe.toISOString(),
      reference: p?.reference ?? '',
      ...(p?.operateur ? { operateur: p.operateur } : {}),
    };
  }

  /** Remboursements qui attendent une décision (rôle validation-remboursement). */
  async aValider(u: Utilisateur): Promise<VueRemboursement[]> {
    this.exigerValideur(u);
    const liste = await this.depot.remboursements('a-valider');
    return Promise.all(liste.map((r) => this.vueRemboursement(r)));
  }

  /**
   * Décision d'un humain habilité. Jamais sur son propre paiement. Validé : exécuté aussitôt chez le
   * prestataire ; s'il ne répond pas, le remboursement reste « validé » et le rapprochement réessaie.
   */
  async decider(
    u: Utilisateur,
    id: string,
    decision: 'valide' | 'refuse',
  ): Promise<VueRemboursement> {
    this.exigerValideur(u);
    const r = await this.depot.trouverRemboursement(id);
    if (!r) throw new ErreurPaiement('introuvable', 'Remboursement introuvable.');
    const p = await this.depot.trouver(r.paiementId);
    if (!p || p.sujet === u.sujet) {
      throw new ErreurPaiement('interdit', 'Vous ne pouvez pas décider de votre propre paiement.');
    }
    const decide = await this.depot.deciderRemboursement(id, decision, u.sujet, this.horloge());
    if (!decide) throw new ErreurPaiement('deja-decide', 'Ce remboursement a déjà été décidé.');
    if (decision === 'refuse') return this.vueRemboursement(decide);
    try {
      await this.executer(decide);
    } catch {
      // Décision enregistrée ; l'exécution sera reprise par le rapprochement.
    }
    return this.vueRemboursement((await this.depot.trouverRemboursement(id)) ?? decide);
  }

  /** Exécute un remboursement validé chez le prestataire (idempotent par identifiant). */
  private async executer(r: Remboursement): Promise<boolean> {
    const p = await this.depot.trouver(r.paiementId);
    if (!p?.tentative) return false;
    await this.fournisseur.rembourser({
      remboursement: r.id,
      tentative: p.tentative,
      montant: r.montant,
      devise: r.devise,
    });
    return Boolean(await this.depot.marquerEffectue(r.id, this.horloge()));
  }
}
