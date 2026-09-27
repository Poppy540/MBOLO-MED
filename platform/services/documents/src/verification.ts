// Parcours « Vérifier mon identité » du patient (ADR-0014, ADR-0015) : il accepte la charte (par le
// service identite), puis envoie ses photos ici. Un dépôt n'est accepté que si :
// - le compte est celui d'un patient, pour son propre dossier (jamais un agent IA ni un proche) ;
// - la fonction est ouverte pour lui (flag identite.photos, désactivé tant que la charte n'est pas validée) ;
// - son identité n'est pas encore vérifiée ;
// - la dernière décision sur la charte est un accord, dans la version en vigueur.
import type { StatutIdentite } from '@mbolo/dossier-fhir';
import type { Drapeaux } from '@mbolo/drapeaux';
import type { Utilisateur } from '@mbolo/identite';
import { charteAcceptee, type Conditions } from './conditions.js';
import type { TypeDocument } from './depot.js';
import type { DocumentDepose, ServiceDocuments } from './service.js';

export class ErreurVerification extends Error {
  constructor(
    message: string,
    readonly statut: 403 | 409 | 422,
  ) {
    super(message);
  }
}

export interface EtatVerification {
  patientId: string;
  statut: StatutIdentite | 'inconnu';
  charte: { version: string; acceptee: boolean };
  /** Photos présentes : type et date seulement, jamais le contenu. */
  documents: { type: TypeDocument; deposeLe: string }[];
}

export class ServiceVerification {
  constructor(
    private readonly documents: ServiceDocuments,
    private readonly conditions: Conditions,
    private readonly drapeaux: Pick<Drapeaux, 'estActif'>,
    /** Version de la charte en vigueur (texte validé par le juriste, docs/securite/). */
    private readonly versionCharte: string,
  ) {}

  private async patient(u: Utilisateur): Promise<string> {
    if (!u.roles.includes('patient') || !u.patientId) {
      throw new ErreurVerification('Accès refusé.', 403);
    }
    const actif = await this.drapeaux.estActif('identite.photos', {
      sujet: u.sujet,
      typeUtilisateur: 'patient',
    });
    if (!actif) throw new ErreurVerification('Fonction non disponible.', 403);
    return u.patientId;
  }

  async etat(u: Utilisateur): Promise<EtatVerification> {
    const patientId = await this.patient(u);
    const [statut, chartes, documents] = await Promise.all([
      this.conditions.statutIdentite(patientId),
      this.conditions.chartes(patientId),
      this.documents.duPatient(patientId),
    ]);
    return {
      patientId,
      statut: statut ?? 'inconnu',
      charte: {
        version: this.versionCharte,
        acceptee: charteAcceptee(chartes, patientId, this.versionCharte),
      },
      documents: documents.map((d) => ({ type: d.type, deposeLe: d.deposeLe.toISOString() })),
    };
  }

  async deposer(u: Utilisateur, type: string, octets: Buffer): Promise<DocumentDepose> {
    const patientId = await this.patient(u);
    const statut = await this.conditions.statutIdentite(patientId);
    if (!statut) throw new ErreurVerification("Renseignez d'abord votre identité.", 409);
    if (statut === 'verifiee') {
      throw new ErreurVerification('Votre identité est déjà vérifiée.', 409);
    }
    const chartes = await this.conditions.chartes(patientId);
    if (!charteAcceptee(chartes, patientId, this.versionCharte)) {
      throw new ErreurVerification("Acceptez d'abord la charte de vérification d'identité.", 403);
    }
    return this.documents.deposer({ patientId, type, octets, versionCharte: this.versionCharte });
  }
}
