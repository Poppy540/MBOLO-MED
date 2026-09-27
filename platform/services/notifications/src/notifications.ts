// Envoi d'une notification (ADR-0012) : gabarit fermé, consentement C-RAPPELS pour un patient,
// numéro lu dans le dossier au moment de l'envoi. Ni le numéro ni le texte ne sont journalisés.
import { PAYS_PAR_DEFAUT, rediger, type Gabarit, type Pays, type Variables } from './gabarits.js';

/** Destinataire : référence FHIR d'un patient ou d'un professionnel. */
export type Destinataire = `Patient/${string}` | `Practitioner/${string}`;

export const estDestinataire = (x: string): x is Destinataire =>
  /^(Patient|Practitioner)\/[A-Za-z0-9\-.]{1,64}$/.test(x);

/** Lecture dans le dossier (via la passerelle) : numéro de téléphone et consentement aux rappels. */
export interface SourceContacts {
  telephone(d: Destinataire): Promise<string | undefined>;
  accepteRappels(patientId: string): Promise<boolean>;
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

  async envoyer(d: Demande): Promise<Resultat> {
    // Le texte est rédigé d'abord : une variable invalide est une erreur de l'appelant.
    const texte = rediger(d.gabarit, d.variables, this.pays);
    if (d.destinataire.startsWith('Patient/')) {
      const patientId = d.destinataire.slice('Patient/'.length);
      if (!(await this.contacts.accepteRappels(patientId))) return 'ignoree-sans-consentement';
    }
    const telephone = await this.contacts.telephone(d.destinataire);
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
