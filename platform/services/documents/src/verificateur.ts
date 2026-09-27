// Vérification d'identité par une personne habilitée (ADR-0015), rôle verification-identite (double
// authentification, jamais un agent IA, aucun accès clinique) :
// - liste des patients dont les photos attendent une décision ;
// - identité déclarée et photos : chaque consultation est tracée dans le dossier du patient AVANT
//   d'être montrée (sans trace, rien n'est montré) ;
// - décision « vérifiée » (avec le numéro), « refusée » (motif codé) ou « à refaire » (photos effacées).
// Aucune reconnaissance faciale automatique : la comparaison est faite à l'œil par la personne.
import { randomUUID } from 'node:crypto';
import type { Identifier, Patient } from 'fhir/r4.js';
import {
  EXTENSION_STATUT_IDENTITE,
  SYSTEMES,
  evenementAccesDossier,
  statutIdentite,
  type Environnement,
  type StatutIdentite,
  type TypeIdentifiantPatient,
} from '@mbolo/dossier-fhir';
import type { Utilisateur } from '@mbolo/identite';
import type { DossierIdentite } from './dossier.js';
import type { DepotDocuments, MotifRefus, Resultat, TypeDocument } from './depot.js';
import type { Format } from './format.js';
import { ErreurDocument, type ServiceDocuments } from './service.js';
import { ErreurVerification } from './verification.js';

const ROLE = 'verification-identite';
const SOURCE = 'documents';
const DOCUMENT_IDENTITE: readonly TypeDocument[] = ['piece-identite', 'acte-naissance'];

export interface ParametresVerificateur {
  /** Système (URI) de chaque type de numéro : il dépend du pays (Gabon : CNAMGS). */
  systemes: Record<TypeIdentifiantPatient, string>;
  env: Environnement;
}

export interface FicheVerification {
  patientId: string;
  statut: StatutIdentite | 'inconnu';
  /** Identité déclarée à l'inscription, à comparer aux photos. */
  nom?: string;
  prenoms: string[];
  naissance?: string;
  identifiants: { type: string; valeur: string }[];
  documents: { id: string; type: TypeDocument; deposeLe: string }[];
}

export interface DemandeDecision {
  resultat: Resultat;
  motif?: MotifRefus;
  identifiant?: { type: TypeIdentifiantPatient; valeur: string };
}

export class ServiceVerificateur {
  constructor(
    private readonly documents: ServiceDocuments,
    private readonly depot: DepotDocuments,
    private readonly dossier: DossierIdentite,
    private readonly parametres: ParametresVerificateur,
    private readonly horloge: () => Date = () => new Date(),
  ) {}

  private exigerRole(u: Utilisateur, patientId?: string): void {
    if (!u.roles.includes(ROLE) || u.roles.includes('agent-ia')) {
      throw new ErreurVerification('Accès refusé.', 403);
    }
    // Personne ne vérifie sa propre identité.
    if (patientId && u.patientId === patientId) {
      throw new ErreurVerification('Accès refusé.', 403);
    }
  }

  /** Trace dans le dossier, avant de montrer quoi que ce soit (échec : rien n'est montré). */
  private async tracer(u: Utilisateur, patientId: string, consulte: string): Promise<void> {
    await this.dossier.tracer(
      evenementAccesDossier({
        patientId,
        sujet: u.sujet,
        roles: u.roles,
        autorise: true,
        motifDecision: 'verification-identite',
        source: SOURCE,
        details: [{ type: 'consultation-verification-identite', valeur: consulte }],
        date: this.horloge().toISOString(),
        env: this.parametres.env,
      }),
    );
  }

  /** Photos présentes déposées depuis la dernière décision. */
  private async aDecider(patientId: string) {
    const derniere = (await this.depot.derniereDecision(patientId))?.decideLe.getTime();
    return (await this.documents.duPatient(patientId)).filter(
      (d) => derniere === undefined || d.deposeLe.getTime() > derniere,
    );
  }

  async aVerifier(u: Utilisateur): Promise<{ patientId: string; depuis: string }[]> {
    this.exigerRole(u);
    const liste = [];
    for (const e of await this.depot.enAttente(50)) {
      const p = await this.dossier.patient(e.patientId);
      const statut = p ? statutIdentite(p) : undefined;
      if (statut && statut !== 'verifiee' && u.patientId !== e.patientId) {
        liste.push({ patientId: e.patientId, depuis: e.depuis.toISOString() });
      }
    }
    return liste;
  }

  async fiche(u: Utilisateur, patientId: string): Promise<FicheVerification> {
    this.exigerRole(u, patientId);
    const p = await this.dossier.patient(patientId);
    if (!p) throw new ErreurDocument('introuvable', 'Patient introuvable.');
    await this.tracer(u, patientId, 'identite-declaree');
    const nom = p.name?.[0];
    return {
      patientId,
      statut: statutIdentite(p) ?? 'inconnu',
      ...(nom?.family ? { nom: nom.family } : {}),
      prenoms: nom?.given ?? [],
      ...(p.birthDate ? { naissance: p.birthDate } : {}),
      identifiants: (p.identifier ?? []).flatMap((i) => {
        const type = i.type?.coding?.find(
          (c) => c.system === SYSTEMES.typeIdentifiantPatient,
        )?.code;
        return type && i.value ? [{ type, valeur: i.value }] : [];
      }),
      documents: (await this.aDecider(patientId)).map((d) => ({
        id: d.id,
        type: d.type,
        deposeLe: d.deposeLe.toISOString(),
      })),
    };
  }

  async photo(
    u: Utilisateur,
    patientId: string,
    documentId: string,
  ): Promise<{ format: Format; octets: Buffer }> {
    this.exigerRole(u, patientId);
    const d = await this.documents.lire(documentId);
    // Même réponse si la photo n'existe pas ou appartient à un autre patient.
    if (d.meta.patientId !== patientId) {
      throw new ErreurDocument('introuvable', 'Document introuvable.');
    }
    await this.tracer(u, patientId, d.meta.type);
    return { format: d.format, octets: d.octets };
  }

  async decider(u: Utilisateur, patientId: string, demande: DemandeDecision): Promise<void> {
    this.exigerRole(u, patientId);
    const p = await this.dossier.patient(patientId);
    if (!p) throw new ErreurDocument('introuvable', 'Patient introuvable.');
    const statut = statutIdentite(p);
    if (statut === 'verifiee') {
      throw new ErreurVerification('Cette identité est déjà vérifiée.', 409);
    }
    const photos = await this.aDecider(patientId);
    if (
      !photos.some((d) => DOCUMENT_IDENTITE.includes(d.type)) ||
      !photos.some((d) => d.type === 'visage')
    ) {
      throw new ErreurVerification('Aucune photo à vérifier pour ce patient.', 409);
    }
    if (demande.resultat === 'refusee' && !demande.motif) {
      throw new ErreurVerification('Un refus exige un motif.', 422);
    }
    if (demande.resultat !== 'refusee' && demande.motif) {
      throw new ErreurVerification('Un motif accompagne seulement un refus.', 422);
    }

    if (demande.resultat === 'verifiee') {
      const identifiants = this.numeros(p, demande.identifiant);
      if (identifiants.length === 0) {
        throw new ErreurVerification(
          "Indiquez le numéro d'assurance maladie ou le numéro provisoire.",
          422,
        );
      }
      await this.dossier.modifierIdentite(patientId, avecStatut(p, 'verifiee'), identifiants);
    } else if (demande.resultat === 'refusee') {
      await this.dossier.modifierIdentite(patientId, avecStatut(p, 'refusee'));
    } else {
      // À refaire : les photos deviennent illisibles puis sont supprimées ; le patient en renvoie.
      await this.documents.effacerDuPatient(patientId);
    }
    await this.depot.enregistrerDecision({
      id: randomUUID(),
      patientId,
      verificateur: u.sujet,
      resultat: demande.resultat,
      ...(demande.motif ? { motif: demande.motif } : {}),
      decideLe: this.horloge(),
    });
  }

  /** Numéros du patient, avec celui saisi par le vérificateur à la place de celui du même type. */
  private numeros(p: Patient, saisi: DemandeDecision['identifiant']): Identifier[] {
    const type = (i: Identifier) =>
      i.type?.coding?.find((c) => c.system === SYSTEMES.typeIdentifiantPatient)?.code;
    const existants = p.identifier ?? [];
    if (!saisi) return existants.filter((i) => type(i));
    return [
      ...existants.filter((i) => type(i) !== saisi.type),
      {
        system: this.parametres.systemes[saisi.type],
        type: { coding: [{ system: SYSTEMES.typeIdentifiantPatient, code: saisi.type }] },
        value: saisi.valeur,
      },
    ];
  }
}

function avecStatut(p: Patient, statut: StatutIdentite): NonNullable<Patient['extension']> {
  return [
    ...(p.extension ?? []).filter((e) => e.url !== EXTENSION_STATUT_IDENTITE),
    { url: EXTENSION_STATUT_IDENTITE, valueCode: statut },
  ];
}
