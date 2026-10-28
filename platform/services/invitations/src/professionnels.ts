// Invitation des professionnels de santé (ADR-0026). Par l'équipe de recrutement (rôle humain
// `recrutement`, double authentification), jamais par un agent IA :
// - fiche Practitioner créée inactive (« à vérifier ») dans le dossier, avec le nom donné par le
//   candidat lors du premier échange ; il la complète ensuite dans son dossier de candidature ;
// - code à usage unique (empreinte seulement), montré une fois au recruteur, qui le remet au candidat ;
// - le candidat crée son compte avec ce code : rôle d'attente `professionnel-candidat`, sans accès
//   aux patients ; seule la vérification par une personne habilitée l'activera (PR suivantes).
import { randomUUID } from 'node:crypto';
import type { Practitioner } from 'fhir/r4.js';
import { praticien, valider, type Environnement } from '@mbolo/dossier-fhir';
import type { Drapeaux } from '@mbolo/drapeaux';
import type { Utilisateur } from '@mbolo/identite';
import { genererCode, presenter, type Empreinte } from './codes.js';
import {
  COHORTE_PROFESSIONNELS,
  statut,
  type DepotInvitations,
  type Invitation,
  type Statut,
} from './depot.js';

export const ROLE_RECRUTEMENT = 'recrutement';

/** Longueur maximale d'un nom ou d'un prénom saisi par le recruteur. */
export const NOM_MAX = 80;

/** Fiche du candidat dans le dossier (via la passerelle, compte de service des invitations). */
export interface DossierProfessionnels {
  /** Crée la fiche et retourne son identifiant. */
  creer(p: Practitioner): Promise<string>;
}

export interface ParametresProfessionnels {
  /** Validité d'un code de professionnel, en jours (14 par défaut, comme les patients). */
  validiteJours: number;
  /** Codes de professionnels au plus pour ce déploiement, révoqués compris. */
  quota: number;
  env: Environnement;
}

export class ErreurProfessionnel extends Error {
  constructor(
    readonly statut: 400 | 403 | 404 | 409,
    message: string,
    readonly motif?: string,
  ) {
    super(message);
  }
}

export interface ProfessionnelInvite {
  id: string;
  /** Fiche du candidat dans le dossier (référence opaque). */
  practitionerId: string;
  /** Montré une seule fois au recruteur ; conservé nulle part. */
  code: string;
  expireLe: string;
}

export interface ProfessionnelListe {
  id: string;
  practitionerId: string;
  statut: Statut;
  /** Recruteur (identifiant de compte opaque) : la vérification sera faite par quelqu'un d'autre. */
  creePar: string;
  creeLe: string;
  expireLe: string;
}

const texte = /^[\p{L}\p{M}' .-]+$/u;
const nomValide = (x: string): boolean =>
  x.trim().length > 0 && x.length <= NOM_MAX && texte.test(x.trim());

export class ServiceRecrutement {
  constructor(
    private readonly depot: DepotInvitations,
    private readonly empreinte: Empreinte,
    private readonly dossier: DossierProfessionnels,
    private readonly drapeaux: Pick<Drapeaux, 'estActif'>,
    private readonly parametres: ParametresProfessionnels,
    private readonly horloge: () => Date = () => new Date(),
  ) {
    if (
      !Number.isInteger(parametres.validiteJours) ||
      parametres.validiteJours < 1 ||
      parametres.validiteJours > 30
    ) {
      throw new Error('Durée de validité des codes de professionnels invalide (1 à 30 jours).');
    }
    if (!Number.isInteger(parametres.quota) || parametres.quota < 1) {
      throw new Error('Quota de codes de professionnels invalide.');
    }
  }

  /** Un humain de l'équipe de recrutement, jamais un agent IA ; fonction ouverte pour lui. */
  private async exigerRecruteur(u: Utilisateur): Promise<void> {
    if (!u.roles.includes(ROLE_RECRUTEMENT) || u.agent || u.roles.includes('agent-ia')) {
      throw new ErreurProfessionnel(403, 'Accès refusé.');
    }
    const ouvert = await this.drapeaux.estActif('professionnels.recrutement', {
      sujet: u.sujet,
      typeUtilisateur: ROLE_RECRUTEMENT,
    });
    if (!ouvert) throw new ErreurProfessionnel(403, 'Fonction non disponible.');
  }

  async inviter(u: Utilisateur, d: { nom: string; prenom: string }): Promise<ProfessionnelInvite> {
    await this.exigerRecruteur(u);
    if (!nomValide(d.nom) || !nomValide(d.prenom)) {
      throw new ErreurProfessionnel(400, 'Nom ou prénom invalide.', 'nom-invalide');
    }
    const fiche = praticien({
      nom: d.nom.trim(),
      prenom: d.prenom.trim(),
      statut: 'a-verifier',
      env: this.parametres.env,
    });
    const violations = valider(fiche, this.parametres.env);
    if (violations.length > 0) {
      throw new ErreurProfessionnel(400, 'Fiche du professionnel invalide.', violations[0]?.regle);
    }
    const maintenant = this.horloge();
    // Quota vérifié avant d'écrire dans le dossier ; de nouveau sous verrou à l'enregistrement.
    const existants = await this.depot.listerProfessionnels(this.parametres.quota);
    if (existants.length >= this.parametres.quota) {
      throw new ErreurProfessionnel(409, 'Quota de codes atteint.', 'quota-atteint');
    }
    const practitionerId = await this.dossier.creer(fiche);
    const expireLe = new Date(maintenant.getTime() + this.parametres.validiteJours * 86_400_000);
    for (let essai = 0; essai < 3; essai++) {
      const code = genererCode();
      const invitation: Invitation = {
        id: randomUUID(),
        empreinte: this.empreinte(code),
        cohorte: COHORTE_PROFESSIONNELS,
        type: 'professionnel',
        practitionerId,
        creePar: u.sujet,
        creeLe: maintenant,
        expireLe,
      };
      const r = await this.depot.creerProfessionnel(invitation, this.parametres.quota);
      if (r === 'quota-atteint') {
        throw new ErreurProfessionnel(409, 'Quota de codes atteint.', 'quota-atteint');
      }
      if (r === 'cree') {
        return {
          id: invitation.id,
          practitionerId,
          code: presenter(code),
          expireLe: expireLe.toISOString(),
        };
      }
    }
    throw new Error("Création d'invitation impossible (collisions répétées).");
  }

  async lister(u: Utilisateur): Promise<ProfessionnelListe[]> {
    await this.exigerRecruteur(u);
    const maintenant = this.horloge();
    return (await this.depot.listerProfessionnels(500)).map((i) => ({
      id: i.id,
      practitionerId: i.practitionerId ?? '',
      statut: statut(i, maintenant),
      creePar: i.creePar,
      creeLe: i.creeLe.toISOString(),
      expireLe: i.expireLe.toISOString(),
    }));
  }

  /**
   * Séparation des tâches (ADR-0026) : comptes qui ont recruté cette fiche, pour que le service
   * documents refuse qu'ils la vérifient. Réservé au compte de service documents (contrôlé par la
   * route), sans flag : la vérification doit rester possible même si les invitations sont fermées.
   */
  async recruteursDe(practitionerId: string): Promise<string[]> {
    return this.depot.recruteursDe(practitionerId);
  }

  /** Révoque un code encore inutilisé ; la fiche inactive reste dans le dossier (jamais supprimée). */
  async revoquer(u: Utilisateur, id: string): Promise<void> {
    await this.exigerRecruteur(u);
    if (!(await this.depot.revoquerProfessionnel(id, this.horloge()))) {
      throw new ErreurProfessionnel(404, 'Invitation introuvable ou déjà utilisée.', 'introuvable');
    }
  }
}
