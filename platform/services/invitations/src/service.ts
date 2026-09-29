// Règles de l'accès sur invitation (ADR-0013). Les paramètres (cohortes, quota, durée) viennent du
// déploiement : rien n'est propre à un pays dans le code.
import { randomUUID } from 'node:crypto';
import { genererCode, normaliser, presenter, type Empreinte } from './codes.js';
import {
  COHORTE_PROCHES,
  COHORTE_RECUPERATION,
  statut,
  type DepotInvitations,
  type Invitation,
  type Statut,
  type TypeInvitation,
} from './depot.js';

export interface ParametresInvitations {
  /** Cohortes ouvertes par ce déploiement, ex. une ville de la vague en cours. */
  cohortes: readonly string[];
  /** Nombre maximal d'invitations par cohorte (vague 1 : 100). */
  quotaParCohorte: number;
  /** Durée de validité d'un code (14 jours). */
  validiteJours: number;
}

export const COHORTE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export class ErreurInvitation extends Error {
  constructor(
    readonly motif: 'cohorte-inconnue' | 'quota-atteint' | 'introuvable',
    message: string,
  ) {
    super(message);
  }
}

export interface InvitationCreee {
  id: string;
  /** Montré une seule fois : il n'est conservé nulle part. */
  code: string;
  cohorte: string;
  expireLe: string;
}

export interface InvitationListee {
  id: string;
  cohorte: string;
  creeLe: string;
  expireLe: string;
  statut: Statut;
}

/** Code utilisé à l'inscription : cohorte, type, et fiche du proche pour un code de proche. */
export interface CodeUtilise {
  cohorte: string;
  type: TypeInvitation;
  relatedPersonId?: string;
}

export function verifierParametres(p: ParametresInvitations): void {
  for (const reservee of [COHORTE_PROCHES, COHORTE_RECUPERATION]) {
    if (p.cohortes.includes(reservee)) {
      throw new Error(`La cohorte « ${reservee} » est réservée aux codes techniques.`);
    }
  }
  if (p.cohortes.length === 0 || !p.cohortes.every((c) => COHORTE.test(c))) {
    throw new Error('Cohortes invalides (minuscules, chiffres et tirets, au moins une).');
  }
  if (!Number.isInteger(p.quotaParCohorte) || p.quotaParCohorte < 1) {
    throw new Error('Quota par cohorte invalide.');
  }
  if (!Number.isInteger(p.validiteJours) || p.validiteJours < 1 || p.validiteJours > 90) {
    throw new Error('Durée de validité invalide (1 à 90 jours).');
  }
}

export class ServiceInvitations {
  constructor(
    private readonly depot: DepotInvitations,
    private readonly empreinte: Empreinte,
    private readonly parametres: ParametresInvitations,
    private readonly horloge: () => Date = () => new Date(),
    /** Active la fiche du proche avant d'utiliser son code (ADR-0019) ; sans elle, codes de proches refusés. */
    private readonly activerProche?: (i: Invitation) => Promise<void>,
  ) {
    verifierParametres(parametres);
  }

  async creer(o: { cohorte: string; par: string }): Promise<InvitationCreee> {
    if (!this.parametres.cohortes.includes(o.cohorte)) {
      throw new ErreurInvitation('cohorte-inconnue', 'Cohorte non ouverte dans ce déploiement.');
    }
    const maintenant = this.horloge();
    // Une collision d'empreinte est improbable ; on retire un code le cas échéant.
    for (let essai = 0; essai < 3; essai++) {
      const code = genererCode();
      const invitation: Invitation = {
        id: randomUUID(),
        empreinte: this.empreinte(code),
        cohorte: o.cohorte,
        type: 'patient',
        creePar: o.par,
        creeLe: maintenant,
        expireLe: new Date(maintenant.getTime() + this.parametres.validiteJours * 86_400_000),
      };
      const r = await this.depot.creerSousQuota(invitation, this.parametres.quotaParCohorte);
      if (r === 'quota-atteint') {
        throw new ErreurInvitation('quota-atteint', 'Quota de la cohorte atteint.');
      }
      if (r === 'cree') {
        return {
          id: invitation.id,
          code: presenter(code),
          cohorte: invitation.cohorte,
          expireLe: invitation.expireLe.toISOString(),
        };
      }
    }
    throw new Error("Création d'invitation impossible (collisions répétées).");
  }

  /** Code encore utilisable, d'un des types acceptés par l'appelant. */
  private async valide(saisie: string, types: readonly TypeInvitation[]) {
    const code = normaliser(saisie);
    if (!code) return undefined;
    const empreinte = this.empreinte(code);
    const i = await this.depot.trouver(empreinte);
    return i && types.includes(i.type) && statut(i, this.horloge()) === 'valide'
      ? { i, empreinte }
      : undefined;
  }

  /**
   * Vrai si le code peut encore servir ; ne dit jamais pourquoi il ne peut pas (inconnu, expiré…).
   * Par défaut, seuls les codes de patient : un appelant qui ne sait pas créer un compte de proche
   * ne doit jamais en accepter un (il en ferait un compte patient).
   */
  async verifier(saisie: string, types: readonly TypeInvitation[] = ['patient']): Promise<boolean> {
    return !!(await this.valide(saisie, types));
  }

  /**
   * Utilise le code pour le compte `sujet` ; `undefined` si le code ne sert pas. Pour un proche, la
   * fiche est activée d'abord : si le dossier ne répond pas, le code reste utilisable.
   */
  async utiliser(
    saisie: string,
    sujet: string,
    types: readonly TypeInvitation[] = ['patient'],
  ): Promise<CodeUtilise | undefined> {
    const v = await this.valide(saisie, types);
    if (!v) return undefined;
    if (v.i.type === 'proche') {
      if (!this.activerProche) return undefined;
      await this.activerProche(v.i);
    }
    const i = await this.depot.utiliser(v.empreinte, sujet, this.horloge());
    if (!i) return undefined;
    return {
      cohorte: i.cohorte,
      type: i.type,
      ...(i.relatedPersonId ? { relatedPersonId: i.relatedPersonId } : {}),
    };
  }

  async revoquer(id: string): Promise<void> {
    if (!(await this.depot.revoquer(id, this.horloge()))) {
      throw new ErreurInvitation('introuvable', 'Invitation introuvable ou déjà utilisée.');
    }
  }

  async lister(cohorte: string): Promise<InvitationListee[]> {
    if (!this.parametres.cohortes.includes(cohorte)) {
      throw new ErreurInvitation('cohorte-inconnue', 'Cohorte non ouverte dans ce déploiement.');
    }
    const maintenant = this.horloge();
    return (await this.depot.lister(cohorte, 500)).map((i) => ({
      id: i.id,
      cohorte: i.cohorte,
      creeLe: i.creeLe.toISOString(),
      expireLe: i.expireLe.toISOString(),
      statut: statut(i, maintenant),
    }));
  }
}
