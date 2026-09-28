// Invitation d'un proche par le patient (ADR-0019). Le patient lui-même, jamais un agent IA :
// - fiche du proche (RelatedPerson) créée inactive dans le dossier : prénom et lien seulement ;
// - consentement C-PROCHE du patient, enregistré par le service identite avec son propre jeton ;
// - code à usage unique (empreinte seulement), 3 proches au plus, valable 7 jours ;
// - code envoyé par SMS au numéro saisi par le patient, qui n'est ni gardé ni journalisé.
// La fiche est activée quand le proche crée son compte avec le code (extension Keycloak).
import { randomUUID } from 'node:crypto';
import type { RelatedPerson } from 'fhir/r4.js';
import { procheInvite, valider, type Environnement, type LienProche } from '@mbolo/dossier-fhir';
import type { Drapeaux } from '@mbolo/drapeaux';
import type { Utilisateur } from '@mbolo/identite';
import { genererCode, presenter, type Empreinte } from './codes.js';
import {
  COHORTE_PROCHES,
  statut,
  type DepotInvitations,
  type Invitation,
  type Statut,
} from './depot.js';

/** Fiche du proche dans le dossier (via la passerelle, compte de service des invitations). */
export interface DossierProches {
  /** Crée la fiche et retourne son identifiant. */
  creer(r: RelatedPerson): Promise<string>;
  lire(id: string): Promise<RelatedPerson | undefined>;
  /** Marque la fiche active : le proche a créé son compte. */
  activer(id: string): Promise<void>;
  /** Marque la fiche inactive : le patient a retiré ce proche. */
  desactiver(id: string): Promise<void>;
}

/** Consentement C-PROCHE du patient, par le service identite avec le jeton du patient. */
export interface ConsentementsProche {
  accorder(o: {
    jetonPatient: string;
    patientId: string;
    relatedPersonId: string;
    versionTexte: string;
  }): Promise<void>;
  /** Retire les partages C-PROCHE actifs avec cette fiche (le proche n'a plus accès). */
  retirer(o: { jetonPatient: string; patientId: string; relatedPersonId: string }): Promise<void>;
}

/** Envoi du code par SMS (service notifications, gabarit fermé). */
export interface SmsInvitation {
  envoyer(o: { telephone: string; code: string; jours: number }): Promise<'envoyee' | 'echec'>;
}

export interface ParametresProches {
  /** Proches au plus par patient (ADR-0019 : 3). */
  max: number;
  /** Validité d'un code de proche, en jours (ADR-0019 : 7). */
  validiteJours: number;
  /**
   * Invitations au plus par patient sur 24 heures, annulées comprises : chaque invitation envoie un
   * SMS, parfois international ; annuler puis réinviter en boucle ne doit pas en envoyer sans fin.
   */
  parJour: number;
  env: Environnement;
}

export class ErreurProche extends Error {
  constructor(
    readonly statut: 400 | 403 | 404 | 409 | 429,
    message: string,
    readonly motif?: string,
  ) {
    super(message);
  }

  static parJour(): ErreurProche {
    return new ErreurProche(
      429,
      'Trop d’invitations aujourd’hui. Réessayez demain.',
      'limite-jour',
    );
  }
}

export interface ProcheInvite {
  id: string;
  /** Fiche du proche dans le dossier (référence opaque), pour relier l'invitation au partage. */
  relatedPersonId: string;
  /** Montré une seule fois au patient, en secours du SMS ; conservé nulle part. */
  code: string;
  expireLe: string;
  sms: 'envoyee' | 'echec';
}

export interface ProcheListe {
  id: string;
  /** Fiche du proche : relie l'invitation au partage C-PROCHE affiché au patient. */
  relatedPersonId?: string;
  prenom: string;
  lien?: string;
  statut: Statut;
  creeLe: string;
  expireLe: string;
}

export class ServiceProches {
  constructor(
    private readonly depot: DepotInvitations,
    private readonly empreinte: Empreinte,
    private readonly dossier: DossierProches,
    private readonly consentements: ConsentementsProche,
    private readonly sms: SmsInvitation,
    private readonly drapeaux: Pick<Drapeaux, 'estActif'>,
    private readonly parametres: ParametresProches,
    private readonly horloge: () => Date = () => new Date(),
  ) {
    if (!Number.isInteger(parametres.max) || parametres.max < 1 || parametres.max > 10) {
      throw new Error('Nombre de proches par patient invalide (1 à 10).');
    }
    if (
      !Number.isInteger(parametres.validiteJours) ||
      parametres.validiteJours < 1 ||
      parametres.validiteJours > 30
    ) {
      throw new Error('Durée de validité des codes de proches invalide (1 à 30 jours).');
    }
    if (!Number.isInteger(parametres.parJour) || parametres.parJour < 1) {
      throw new Error('Nombre d’invitations de proches par jour invalide.');
    }
  }

  /** Le patient lui-même, avec un dossier, jamais un agent IA ; fonction ouverte pour lui. */
  private async exigerPatient(u: Utilisateur): Promise<string> {
    if (!u.roles.includes('patient') || !u.patientId || u.agent || u.roles.includes('agent-ia')) {
      throw new ErreurProche(403, 'Seul le patient invite ses proches.');
    }
    const ouvert = await this.drapeaux.estActif('consentement.proche', {
      sujet: u.sujet,
      typeUtilisateur: 'patient',
    });
    if (!ouvert) throw new ErreurProche(403, 'Fonction non disponible.');
    return u.patientId;
  }

  async inviter(
    u: Utilisateur,
    jetonPatient: string,
    d: { prenom: string; lien: LienProche; telephone: string; versionTexte: string },
  ): Promise<ProcheInvite> {
    const patientId = await this.exigerPatient(u);
    const maintenant = this.horloge();
    // Contrôles avant d'écrire dans le dossier ; les limites sont de nouveau vérifiées sous verrou.
    const invitations = await this.depot.listerProches(u.sujet);
    const depuis = new Date(maintenant.getTime() - 86_400_000);
    if (invitations.filter((i) => i.creeLe > depuis).length >= this.parametres.parJour) {
      throw ErreurProche.parJour();
    }
    const deja = invitations.filter(
      (i) => !i.revoqueLe && (!!i.utiliseLe || i.expireLe > maintenant),
    );
    if (deja.length >= this.parametres.max) {
      throw new ErreurProche(409, `${this.parametres.max} proches au plus.`, 'limite-atteinte');
    }
    const fiche = procheInvite({
      patientId,
      prenom: d.prenom,
      lien: d.lien,
      actif: false,
      env: this.parametres.env,
    });
    const violations = valider(fiche, this.parametres.env);
    if (violations.length > 0) {
      throw new ErreurProche(400, 'Prénom ou lien invalide.', violations[0]?.regle);
    }
    const relatedPersonId = await this.dossier.creer(fiche);
    await this.consentements.accorder({
      jetonPatient,
      patientId,
      relatedPersonId,
      versionTexte: d.versionTexte,
    });
    const expireLe = new Date(maintenant.getTime() + this.parametres.validiteJours * 86_400_000);
    for (let essai = 0; essai < 3; essai++) {
      const code = genererCode();
      const invitation: Invitation = {
        id: randomUUID(),
        empreinte: this.empreinte(code),
        cohorte: COHORTE_PROCHES,
        type: 'proche',
        relatedPersonId,
        creePar: u.sujet,
        creeLe: maintenant,
        expireLe,
      };
      const r = await this.depot.creerPourProche(invitation, this.parametres.max, maintenant, {
        max: this.parametres.parJour,
        depuis,
      });
      if (r === 'limite-jour') throw ErreurProche.parJour();
      if (r === 'limite-atteinte') {
        throw new ErreurProche(409, `${this.parametres.max} proches au plus.`, 'limite-atteinte');
      }
      if (r === 'cree') {
        const presente = presenter(code);
        const sms = await this.sms
          .envoyer({ telephone: d.telephone, code: presente, jours: this.parametres.validiteJours })
          .catch(() => 'echec' as const);
        return {
          id: invitation.id,
          relatedPersonId,
          code: presente,
          expireLe: expireLe.toISOString(),
          sms,
        };
      }
    }
    throw new Error("Création d'invitation impossible (collisions répétées).");
  }

  /** Proches invités par ce patient : prénom (lu dans le dossier), lien, statut de l'invitation. */
  async lister(u: Utilisateur): Promise<ProcheListe[]> {
    await this.exigerPatient(u);
    const maintenant = this.horloge();
    const invitations = await this.depot.listerProches(u.sujet);
    return Promise.all(
      invitations.map(async (i) => {
        const fiche = i.relatedPersonId ? await this.dossier.lire(i.relatedPersonId) : undefined;
        const lien = fiche?.relationship?.[0]?.coding?.[0]?.code;
        return {
          id: i.id,
          ...(i.relatedPersonId ? { relatedPersonId: i.relatedPersonId } : {}),
          prenom: fiche?.name?.[0]?.given?.[0] ?? '',
          ...(lien ? { lien } : {}),
          statut: statut(i, maintenant),
          creeLe: i.creeLe.toISOString(),
          expireLe: i.expireLe.toISOString(),
        };
      }),
    );
  }

  /**
   * Le patient retire un proche : une invitation en cours ne peut plus servir ; un proche qui a déjà
   * son compte perd l'accès (partage retiré, fiche inactive). La place est libérée. L'invitation d'un
   * autre patient est « introuvable ».
   */
  async revoquer(u: Utilisateur, jetonPatient: string, id: string): Promise<void> {
    const patientId = await this.exigerPatient(u);
    const i = (await this.depot.listerProches(u.sujet)).find((x) => x.id === id);
    if (!i || i.revoqueLe) throw new ErreurProche(404, 'Invitation introuvable ou déjà annulée.');
    if (i.relatedPersonId) {
      // D'abord l'accès (partage), puis la fiche : en cas d'échec, rien n'est marqué révoqué.
      await this.consentements.retirer({
        jetonPatient,
        patientId,
        relatedPersonId: i.relatedPersonId,
      });
      if (i.utiliseLe) await this.dossier.desactiver(i.relatedPersonId);
    }
    if (!(await this.depot.revoquerProche(id, u.sujet, this.horloge()))) {
      throw new ErreurProche(404, 'Invitation introuvable ou déjà annulée.');
    }
  }

  /** À l'inscription du proche : la fiche devient active avant que le code ne soit utilisé. */
  async activer(i: Invitation): Promise<void> {
    if (i.type === 'proche' && i.relatedPersonId) await this.dossier.activer(i.relatedPersonId);
  }
}
