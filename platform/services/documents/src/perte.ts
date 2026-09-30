// Téléphone perdu (ADR-0023, parcours 2) : le patient n'a plus son ancien numéro.
// 1. L'extension Keycloak ouvre la demande, après un code reçu au nouveau numéro : ce numéro est
//    gardé chiffré (clé propre, enveloppée par la clé maître) jusqu'à la décision.
// 2. Le patient envoie de nouvelles photos (document et visage).
// 3. Une personne du rôle verification-identite (double authentification, jamais un agent IA)
//    compare, avec les photos de l'inscription si elles sont encore conservées, puis accepte ou
//    refuse (motif codé, jamais de texte libre). Chaque consultation est tracée dans le dossier.
// 4. Accepté : SMS d'alerte à l'ancien numéro, puis nouveau numéro dans le dossier avec le parcours
//    « perte » (24 heures sans code de connexion). Dans tous les cas, le numéro chiffré est effacé.
import { randomUUID } from 'node:crypto';
import { telephoneChange } from '@mbolo/dossier-fhir';
import type { Utilisateur } from '@mbolo/identite';
import { chiffrer, dechiffrer, type CleMaitre } from './chiffrement.js';
import type { DepotDocuments, MotifRefus, ResultatPerte, TypeDocument } from './depot.js';
import type { DossierIdentite } from './dossier.js';
import { ErreurDocument, type ServiceDocuments } from './service.js';
import { ErreurVerification } from './verification.js';
import {
  exigerVerificateur,
  type FicheVerification,
  type ServiceVerificateur,
} from './verificateur.js';

const PATIENT = /^[A-Za-z0-9.-]{1,64}$/;
/** Numéro international, tel que Keycloak l'a vérifié par un code (ex. « +241 00 00 00 07 »). */
const TELEPHONE = /^\+[1-9][0-9 ]{7,19}$/;
const DOCUMENT_IDENTITE: readonly TypeDocument[] = ['piece-identite', 'acte-naissance'];

/** Alerte à l'ancien numéro, lu dans le dossier avant la mise à jour (service notifications). */
export interface AlerteNumero {
  numeroChange(patientId: string): Promise<'envoyee' | 'ignoree-sans-numero' | 'echec'>;
}

export interface EtatPerte {
  ouverte: boolean;
  depuis?: string;
  /** Photos envoyées depuis l'ouverture : type et date seulement. */
  photos: { type: TypeDocument; deposeLe: string }[];
}

export interface FichePerte extends Omit<FicheVerification, 'documents'> {
  depuis: string;
  /** Photos envoyées pour cette demande. */
  nouvelles: FicheVerification['documents'];
  /** Photos de l'inscription encore conservées, pour comparer. */
  anciennes: FicheVerification['documents'];
}

export interface DecisionPerte {
  resultat: ResultatPerte;
  motif?: MotifRefus;
}

export class ServicePerte {
  constructor(
    private readonly documents: ServiceDocuments,
    private readonly depot: DepotDocuments,
    private readonly dossier: DossierIdentite,
    private readonly verificateur: ServiceVerificateur,
    private readonly alerte: AlerteNumero,
    private readonly maitre: CleMaitre,
    private readonly horloge: () => Date = () => new Date(),
  ) {}

  /** Demande ouverte par l'extension Keycloak, le nouveau numéro déjà confirmé par un code. */
  async ouvrir(patientId: string, telephone: string): Promise<{ id: string }> {
    if (!PATIENT.test(patientId) || !TELEPHONE.test(telephone)) {
      throw new ErreurVerification('Demande invalide.', 422);
    }
    if (!(await this.dossier.patient(patientId))) {
      throw new ErreurVerification('Dossier introuvable.', 404);
    }
    const id = randomUUID();
    const { donnees, cleEnveloppee } = await chiffrer(
      Buffer.from(telephone, 'utf8'),
      `perte:${id}`,
      this.maitre,
    );
    const ouverte = await this.depot.ouvrirDemandePerte({
      id,
      patientId,
      telephoneChiffre: donnees,
      cleEnveloppee,
      ouverteLe: this.horloge(),
    });
    if (!ouverte) throw new ErreurVerification('Une demande est déjà en cours.', 409);
    return { id };
  }

  /** Le patient voit si sa demande est en cours et quelles photos il a envoyées. */
  async etat(u: Utilisateur): Promise<EtatPerte> {
    if (!u.roles.includes('patient') || !u.patientId) {
      throw new ErreurVerification('Accès refusé.', 403);
    }
    const d = await this.depot.demandePerteOuverte(u.patientId);
    if (!d) return { ouverte: false, photos: [] };
    const photos = (await this.documents.duPatient(u.patientId))
      .filter((p) => p.deposeLe >= d.ouverteLe)
      .map((p) => ({ type: p.type, deposeLe: p.deposeLe.toISOString() }));
    return { ouverte: true, depuis: d.ouverteLe.toISOString(), photos };
  }

  /** Photos envoyées pour la demande : il en faut une du document et une du visage. */
  private async nouvelles(patientId: string, depuis: Date) {
    return (await this.documents.duPatient(patientId)).filter((p) => p.deposeLe >= depuis);
  }

  private static complete(photos: { type: TypeDocument }[]): boolean {
    return (
      photos.some((p) => DOCUMENT_IDENTITE.includes(p.type)) &&
      photos.some((p) => p.type === 'visage')
    );
  }

  async aDecider(u: Utilisateur): Promise<{ patientId: string; depuis: string }[]> {
    exigerVerificateur(u);
    const liste = [];
    for (const d of await this.depot.demandesPerteOuvertes(50)) {
      if (u.patientId === d.patientId) continue;
      if (ServicePerte.complete(await this.nouvelles(d.patientId, d.ouverteLe))) {
        liste.push({ patientId: d.patientId, depuis: d.ouverteLe.toISOString() });
      }
    }
    return liste;
  }

  /** Identité déclarée et photos, nouvelles et anciennes ; tracé dans le dossier avant d'être montré. */
  async fiche(u: Utilisateur, patientId: string): Promise<FichePerte> {
    exigerVerificateur(u, patientId);
    const d = await this.depot.demandePerteOuverte(patientId);
    if (!d) throw new ErreurDocument('introuvable', 'Aucune demande en cours pour ce patient.');
    const { documents, ...identite } = await this.verificateur.fiche(u, patientId);
    const presentes = await this.documents.duPatient(patientId);
    const date = new Map(presentes.map((p) => [p.id, p.deposeLe]));
    const nouvelle = (id: string) => (date.get(id) ?? new Date(0)) >= d.ouverteLe;
    // La fiche du vérificateur ne montre que les photos arrivées depuis la dernière décision :
    // les anciennes sont relues ici, sans leur contenu.
    const anciennes = presentes
      .filter((p) => !nouvelle(p.id))
      .map((p) => ({ id: p.id, type: p.type, deposeLe: p.deposeLe.toISOString() }));
    return {
      ...identite,
      depuis: d.ouverteLe.toISOString(),
      nouvelles: documents.filter((x) => nouvelle(x.id)),
      anciennes,
    };
  }

  async decider(u: Utilisateur, patientId: string, decision: DecisionPerte): Promise<void> {
    exigerVerificateur(u, patientId);
    if (decision.resultat === 'refusee' && !decision.motif) {
      throw new ErreurVerification('Un refus exige un motif.', 422);
    }
    if (decision.resultat === 'acceptee' && decision.motif) {
      throw new ErreurVerification('Un motif accompagne seulement un refus.', 422);
    }
    const d = await this.depot.demandePerteOuverte(patientId);
    if (!d?.telephoneChiffre || !d.cleEnveloppee) {
      throw new ErreurVerification('Aucune demande en cours pour ce patient.', 409);
    }
    if (!ServicePerte.complete(await this.nouvelles(patientId, d.ouverteLe))) {
      throw new ErreurVerification('Aucune photo à vérifier pour cette demande.', 409);
    }
    const maintenant = this.horloge();
    if (decision.resultat === 'acceptee') {
      const telephone = (
        await dechiffrer(d.telephoneChiffre, d.cleEnveloppee, `perte:${d.id}`, this.maitre)
      ).toString('utf8');
      // L'ancien numéro est prévenu d'abord (il est lu dans le dossier avant la mise à jour). Sans
      // alerte, rien ne change : le vrai patient doit pouvoir réagir.
      if ((await this.alerte.numeroChange(patientId)) === 'echec') {
        throw new ErreurVerification('Service momentanément indisponible. Réessayez.', 503);
      }
      await this.dossier.modifierTelephone(patientId, [
        telephoneChange(telephone, 'perte', maintenant),
      ]);
    }
    await this.depot.cloreDemandePerte(d.id, {
      resultat: decision.resultat,
      verificateur: u.sujet,
      ...(decision.motif ? { motif: decision.motif } : {}),
      decideLe: maintenant,
    });
  }
}
