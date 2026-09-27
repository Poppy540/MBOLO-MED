// Règles des documents (ADR-0015). Contrôle d'accès, charte et journal des accès sont appliqués par
// l'API (serveur.ts) : ce service chiffre, range, relit et supprime à échéance.
import { randomUUID } from 'node:crypto';
import { chiffrer, dechiffrer, type CleMaitre } from './chiffrement.js';
import {
  TYPES_DOCUMENT,
  type DepotDocuments,
  type Metadonnees,
  type TypeDocument,
} from './depot.js';
import { TAILLE_MAX, reconnaitre, type Format } from './format.js';
import type { Stockage } from './stockage.js';

export interface ParametresDocuments {
  /** Durée de conservation (jours), fixée par pays avec l'avis juridique. */
  conservationJours: number;
  /** Documents présents au plus, par patient et par type (ex. recto et verso). */
  maxParType: number;
}

export class ErreurDocument extends Error {
  constructor(
    readonly motif: 'format' | 'taille' | 'type' | 'trop-de-documents' | 'introuvable',
    message: string,
  ) {
    super(message);
  }
}

const PATIENT = /^[A-Za-z0-9.-]{1,64}$/;

const trop = () =>
  new ErreurDocument('trop-de-documents', 'Nombre maximal de photos atteint pour ce type.');

export interface DocumentDepose {
  id: string;
  type: TypeDocument;
  format: Format;
  supprimerLe: string;
}

export class ServiceDocuments {
  constructor(
    private readonly depot: DepotDocuments,
    private readonly stockage: Stockage,
    private readonly maitre: CleMaitre,
    private readonly parametres: ParametresDocuments,
    private readonly horloge: () => Date = () => new Date(),
  ) {
    if (!Number.isInteger(parametres.conservationJours) || parametres.conservationJours < 1) {
      throw new Error('Durée de conservation invalide.');
    }
    if (!Number.isInteger(parametres.maxParType) || parametres.maxParType < 1) {
      throw new Error('Nombre maximal de documents par type invalide.');
    }
  }

  async deposer(o: {
    patientId: string;
    type: string;
    octets: Buffer;
    versionCharte: string;
  }): Promise<DocumentDepose> {
    if (!PATIENT.test(o.patientId)) throw new ErreurDocument('type', 'Patient invalide.');
    if (!(TYPES_DOCUMENT as readonly string[]).includes(o.type)) {
      throw new ErreurDocument('type', 'Type de document inconnu.');
    }
    const type = o.type as TypeDocument;
    if (o.octets.length === 0 || o.octets.length > TAILLE_MAX) {
      throw new ErreurDocument('taille', 'Photo vide ou trop lourde (2 Mo au plus).');
    }
    const format = reconnaitre(o.octets);
    if (!format)
      throw new ErreurDocument('format', 'Seules les photos JPEG ou PNG sont acceptées.');
    const id = randomUUID();
    const maintenant = this.horloge();
    const { donnees, cleEnveloppee } = await chiffrer(o.octets, id, this.maitre);
    const m: Metadonnees = {
      id,
      patientId: o.patientId,
      type,
      format,
      taille: o.octets.length,
      versionCharte: o.versionCharte,
      cleEnveloppee,
      deposeLe: maintenant,
      supprimerLe: new Date(maintenant.getTime() + this.parametres.conservationJours * 86_400_000),
    };
    // Contrôle rapide avant l'écriture ; la limite est garantie par l'insertion sous verrou.
    const deja = (await this.depot.duPatient(o.patientId)).filter((d) => d.type === type);
    if (deja.length >= this.parametres.maxParType) throw trop();
    await this.stockage.ecrire(id, donnees);
    let insere: boolean;
    try {
      insere = await this.depot.insererSiPlace(m, this.parametres.maxParType);
    } catch (e) {
      // Sans métadonnées, le contenu chiffré n'a plus de clé : on le retire.
      await this.stockage.supprimer(id).catch(() => undefined);
      throw e;
    }
    if (!insere) {
      await this.stockage.supprimer(id).catch(() => undefined);
      throw trop();
    }
    return { id, type, format, supprimerLe: m.supprimerLe.toISOString() };
  }

  /** Contenu en clair d'un document présent (pour la personne habilitée, via l'API). */
  async lire(id: string): Promise<{ meta: Metadonnees; format: Format; octets: Buffer }> {
    const meta = await this.depot.lire(id);
    if (!meta?.cleEnveloppee || meta.supprimeLe) {
      throw new ErreurDocument('introuvable', 'Document introuvable.');
    }
    const donnees = await this.stockage.lire(id);
    if (!donnees) throw new ErreurDocument('introuvable', 'Document introuvable.');
    return {
      meta,
      format: meta.format,
      octets: await dechiffrer(donnees, meta.cleEnveloppee, id, this.maitre),
    };
  }

  async duPatient(patientId: string): Promise<Omit<Metadonnees, 'cleEnveloppee'>[]> {
    return (await this.depot.duPatient(patientId)).map((m) => {
      const sansCle = { ...m };
      delete sansCle.cleEnveloppee;
      return sansCle;
    });
  }

  /**
   * Suppression à échéance : la clé est détruite d'abord (le contenu devient illisible même si la
   * suppression de l'objet échouait), puis l'objet est supprimé. Retourne le nombre traité.
   */
  async supprimerEchus(limite = 100): Promise<number> {
    const maintenant = this.horloge();
    let n = 0;
    for (const m of await this.depot.echus(maintenant, limite)) {
      if (await this.depot.detruireCle(m.id, maintenant)) {
        await this.stockage.supprimer(m.id).catch(() => undefined);
        n++;
      }
    }
    return n;
  }
}
