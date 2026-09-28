// Logique du paiement (ADR-0017).
// - Le paiement est créé par le service de téléconsultation pour un rendez-vous : le montant vient de
//   la grille du pays, jamais du navigateur.
// - Le patient lance la collecte depuis un portefeuille (le sien ou celui d'un proche) : le numéro va
//   au prestataire et n'est jamais conservé.
// - Un paiement n'est « payé » que si le prestataire le confirme quand on relit son statut.
// - Un agent IA ne déclenche jamais un paiement (principe n°7).
import { randomUUID } from 'node:crypto';
import type { Drapeaux } from '@mbolo/drapeaux';
import type { Utilisateur } from '@mbolo/identite';
import type { DepotPaiements, Paiement, Statut } from './depot.js';
import { LIBELLE, type Fournisseur } from './fournisseur.js';
import { normaliserNumero, type Tarifs, type TypeConsultation } from './tarifs.js';

export type MotifErreur =
  'desactive' | 'introuvable' | 'interdit' | 'numero' | 'operateur' | 'deja-en-cours' | 'deja-paye';

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
    return (await this.rafraichir(p)).statut === 'paye';
  }

  /** Le patient ne voit que ses propres paiements ; celui d'un autre est « introuvable ». */
  private async duPatient(u: Utilisateur, id: string): Promise<Paiement> {
    if (estAgent(u)) throw new ErreurPaiement('interdit', 'Accès refusé.');
    const p = await this.depot.trouver(id);
    if (!p || p.sujet !== u.sujet) throw new ErreurPaiement('introuvable', 'Paiement introuvable.');
    return p;
  }

  async lire(u: Utilisateur, id: string): Promise<VuePaiement> {
    return vue(await this.rafraichir(await this.duPatient(u, id)));
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

    const tentative = randomUUID();
    const demarre = await this.depot.demarrer(
      p.id,
      { tentative, operateur: d.operateur, fournisseur: this.fournisseur.nom },
      this.horloge(),
    );
    if (!demarre) {
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
    const apres = await this.rafraichir(p);
    return { accepte: true, paiement: apres };
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
}
