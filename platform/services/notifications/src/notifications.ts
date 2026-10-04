// Envoi d'une notification (ADR-0012) : gabarit fermé, consentement C-RAPPELS pour un patient,
// numéro lu dans le dossier au moment de l'envoi. Ni le numéro ni le texte ne sont journalisés.
import {
  PAYS_PAR_DEFAUT,
  paysPour,
  rediger,
  redigerAlerteProche,
  redigerCodeConnexion,
  type AlertePatient,
  redigerInvitationProche,
  type Gabarit,
  type Pays,
  type Variables,
} from './gabarits.js';

/** Destinataire : référence FHIR d'un patient ou d'un professionnel. */
export type Destinataire = `Patient/${string}` | `Practitioner/${string}`;

export const estDestinataire = (x: string): x is Destinataire =>
  /^(Patient|Practitioner)\/[A-Za-z0-9\-.]{1,64}$/.test(x);

/** Lecture dans le dossier (via la passerelle) : numéro de téléphone et consentement aux rappels. */
export interface SourceContacts {
  telephone(d: Destinataire): Promise<string | undefined>;
  accepteRappels(patientId: string): Promise<boolean>;
  /** Vrai pendant les 24 heures qui suivent un changement du numéro pour perte (ADR-0023). */
  enAttenteApresPerte(patientId: string): Promise<boolean>;
  /** Langue préférée du patient dans son dossier (BCP 47), si elle y est indiquée (ADR-0025). */
  languePreferee?(patientId: string): Promise<string | undefined>;
}

/** Canal d'envoi (fournisseur SMS ou WhatsApp, ou canal simulé). */
export interface Canal {
  readonly nom: string;
  envoyer(telephone: string, texte: string): Promise<void>;
}

export type Resultat = 'envoyee' | 'ignoree-sans-consentement' | 'ignoree-sans-numero' | 'echec';

export interface Demande {
  destinataire: Destinataire;
  gabarit: Gabarit;
  variables: Variables;
}

export class ServiceNotifications {
  constructor(
    private readonly contacts: SourceContacts,
    private readonly canal: Canal,
    private readonly pays: Pays = PAYS_PAR_DEFAUT,
  ) {}

  /**
   * Langue du SMS pour un patient : sa langue préférée si tous les gabarits y sont approuvés, sinon
   * celle du pays. Un dossier illisible n'empêche pas l'envoi : la langue du pays est utilisée.
   */
  private async paysDuPatient(patientId: string): Promise<Pays> {
    try {
      return paysPour(this.pays, await this.contacts.languePreferee?.(patientId));
    } catch {
      return this.pays;
    }
  }

  async envoyer(d: Demande): Promise<Resultat> {
    // Le texte est rédigé d'abord : une variable invalide est une erreur de l'appelant.
    rediger(d.gabarit, d.variables, this.pays);
    let pays = this.pays;
    if (d.destinataire.startsWith('Patient/')) {
      const patientId = d.destinataire.slice('Patient/'.length);
      if (!(await this.contacts.accepteRappels(patientId))) return 'ignoree-sans-consentement';
      pays = await this.paysDuPatient(patientId);
    }
    const texte = rediger(d.gabarit, d.variables, pays);
    const telephone = await this.contacts.telephone(d.destinataire);
    if (!telephone) return 'ignoree-sans-numero';
    try {
      await this.canal.envoyer(telephone, texte);
      return 'envoyee';
    } catch {
      return 'echec';
    }
  }

  /**
   * Alerte de sécurité au patient (ADR-0019) : son proche invité a créé son compte, ou l'équipe a
   * retiré ses proches à sa demande. Numéro lu dans le dossier ; pas de condition C-RAPPELS
   * (information sur l'accès au dossier, pas un rappel).
   */
  /**
   * Code de double authentification (ADR-0022), demandé par Keycloak : numéro lu dans le dossier,
   * pas de condition C-RAPPELS (c'est le patient qui le demande). Ni le numéro ni le code ne sont
   * journalisés.
   */
  async envoyerCodeConnexion(
    patientId: string,
    code: string,
  ): Promise<Resultat | 'attente-apres-perte'> {
    // Après une perte, le nouveau numéro ne reçoit aucun code pendant 24 heures : si ce n'est pas
    // le vrai patient, celui-ci a le temps de réagir à l'alerte reçue à l'ancien numéro (ADR-0023).
    if (await this.contacts.enAttenteApresPerte(patientId)) return 'attente-apres-perte';
    const texte = redigerCodeConnexion(code, await this.paysDuPatient(patientId));
    const telephone = await this.contacts.telephone(`Patient/${patientId}`);
    if (!telephone) return 'ignoree-sans-numero';
    try {
      await this.canal.envoyer(telephone, texte);
      return 'envoyee';
    } catch {
      return 'echec';
    }
  }

  /**
   * Validation du numéro saisi à l'étape « Mon identité » (revue ASVS n°2, C8), avant que le
   * dossier existe : même texte que le code de connexion, envoyé au numéro donné par Keycloak.
   * Ni le numéro ni le code ne sont journalisés.
   */
  async envoyerCodeVerification(telephone: string, code: string): Promise<Resultat> {
    const texte = redigerCodeConnexion(code, this.pays);
    try {
      await this.canal.envoyer(telephone, texte);
      return 'envoyee';
    } catch {
      return 'echec';
    }
  }

  async alerterPatient(patientId: string, alerte: AlertePatient): Promise<Resultat> {
    const texte = redigerAlerteProche(alerte, await this.paysDuPatient(patientId));
    const telephone = await this.contacts.telephone(`Patient/${patientId}`);
    if (!telephone) return 'ignoree-sans-numero';
    try {
      await this.canal.envoyer(telephone, texte);
      return 'envoyee';
    } catch {
      return 'echec';
    }
  }
}

/**
 * Invitation d'un proche (ADR-0019) : envoyée au numéro saisi par le patient, qui n'est lu ni dans
 * le dossier ni gardé ici. Pas de consentement C-RAPPELS : c'est le patient qui demande l'envoi,
 * et le proche n'est pas un patient.
 */
export async function envoyerInvitationProche(
  canal: Canal,
  d: { telephone: string; code: string; jours: number },
  pays: Pays = PAYS_PAR_DEFAUT,
): Promise<'envoyee' | 'echec'> {
  const texte = redigerInvitationProche(d.code, d.jours, pays);
  try {
    await canal.envoyer(d.telephone, texte);
    return 'envoyee';
  } catch {
    return 'echec';
  }
}

/**
 * Canal simulé : garde les messages en mémoire (développement et tests uniquement, données
 * fictives). Le service refuse de démarrer en production avec ce canal.
 */
export class CanalSimule implements Canal {
  readonly nom = 'simule';
  readonly boite: { telephone: string; texte: string; date: string }[] = [];
  private static readonly MAX = 200;

  async envoyer(telephone: string, texte: string): Promise<void> {
    this.boite.push({ telephone, texte, date: new Date().toISOString() });
    if (this.boite.length > CanalSimule.MAX) this.boite.shift();
  }
}
