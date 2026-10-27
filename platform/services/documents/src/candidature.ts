// Dossier de candidature d'un professionnel de santé (ADR-0026). Le candidat (rôle d'attente
// `professionnel-candidat`, jamais un agent IA) :
// - accepte la charte C-VERIFICATION-PRO (à quoi servent ses pièces, qui les voit, combien de temps) ;
// - dépose ses pièces : diplôme, attestation d'inscription à l'Ordre, pièce d'identité, assurance de
//   responsabilité civile professionnelle si exigée. Chiffrées une par une (enveloppe, ADR-0015),
//   sans image ni nom dans les métadonnées, supprimées à échéance par destruction de la clé.
// - déclare sa spécialité (liste fermée), son Ordre (pays) et son numéro d'inscription, ses langues de
//   consultation : écrits dans sa fiche Practitioner, sans période de validité (une déclaration ne
//   rend jamais « vérifié »), et seulement tant que la fiche est « à vérifier » et inactive.
// Seule une personne habilitée (rôle verification-professionnels, PR suivante) les consultera.
import { randomUUID } from 'node:crypto';
import type { Sql } from '@mbolo/base-donnees';
import {
  declarationDe,
  declarationPraticien,
  estSpecialite,
  statutVerification,
  type Declaration,
  type StatutVerificationPro,
} from '@mbolo/dossier-fhir';
import type { Utilisateur } from '@mbolo/identite';
import { chiffrer, type CleMaitre } from './chiffrement.js';
import type { FichesPraticiens } from './dossier.js';
import { TAILLE_MAX, reconnaitre, type Format } from './format.js';
import type { Stockage } from './stockage.js';

export const ROLE_CANDIDAT = 'professionnel-candidat';

/** Pièces du dossier (liste fermée ; l'assurance RCP dépend de l'avis du juriste, ADR-0026 q. 2). */
export const TYPES_PIECE = [
  'diplome',
  'inscription-ordre',
  'piece-identite',
  'assurance-rcp',
] as const;
export type TypePiece = (typeof TYPES_PIECE)[number];

export interface Piece {
  id: string;
  practitionerId: string;
  type: TypePiece;
  format: Format;
  taille: number;
  versionCharte: string;
  cleEnveloppee?: Buffer;
  deposeLe: Date;
  supprimerLe: Date;
  supprimeLe?: Date;
}

export interface DecisionCharte {
  id: string;
  practitionerId: string;
  sujet: string;
  version: string;
  accepte: boolean;
  decideLe: Date;
}

export interface DepotCandidatures {
  /** Insère la pièce si moins de `max` pièces présentes de ce type ; atomique (verrou). */
  insererPieceSiPlace(p: Piece, max: number): Promise<boolean>;
  /** Pièces présentes (non supprimées) du candidat, les plus récentes d'abord. */
  piecesDe(practitionerId: string): Promise<Piece[]>;
  piecesEchues(maintenant: Date, limite: number): Promise<Piece[]>;
  detruireClePiece(id: string, maintenant: Date): Promise<boolean>;
  enregistrerCharte(d: DecisionCharte): Promise<void>;
  derniereCharte(practitionerId: string): Promise<DecisionCharte | undefined>;
  /** Clés des pièces présentes, par identifiant croissant (rotation de la clé maître). */
  clesPresentes(apres: string | undefined, limite: number): Promise<{ id: string; cle: Buffer }[]>;
  remplacerCle(id: string, ancienne: Buffer, nouvelle: Buffer): Promise<boolean>;
}

const present = (p: Piece) => !p.supprimeLe;

export class DepotCandidaturesMemoire implements DepotCandidatures {
  readonly pieces: Piece[] = [];
  readonly chartes: DecisionCharte[] = [];

  async insererPieceSiPlace(p: Piece, max: number): Promise<boolean> {
    const n = this.pieces.filter(
      (x) => x.practitionerId === p.practitionerId && x.type === p.type && present(x),
    ).length;
    if (n >= max) return false;
    this.pieces.push({ ...p });
    return true;
  }

  async piecesDe(practitionerId: string): Promise<Piece[]> {
    return this.pieces
      .filter((x) => x.practitionerId === practitionerId && present(x))
      .sort((a, b) => b.deposeLe.getTime() - a.deposeLe.getTime())
      .map((x) => ({ ...x }));
  }

  async piecesEchues(maintenant: Date, limite: number): Promise<Piece[]> {
    return this.pieces
      .filter((x) => present(x) && x.supprimerLe <= maintenant)
      .slice(0, limite)
      .map((x) => ({ ...x }));
  }

  async detruireClePiece(id: string, maintenant: Date): Promise<boolean> {
    const p = this.pieces.find((x) => x.id === id);
    if (!p || p.supprimeLe) return false;
    delete p.cleEnveloppee;
    p.supprimeLe = maintenant;
    return true;
  }

  async enregistrerCharte(d: DecisionCharte): Promise<void> {
    this.chartes.push({ ...d });
  }

  async derniereCharte(practitionerId: string): Promise<DecisionCharte | undefined> {
    return this.chartes
      .filter((x) => x.practitionerId === practitionerId)
      .sort((a, b) => b.decideLe.getTime() - a.decideLe.getTime())[0];
  }

  async clesPresentes(apres: string | undefined, limite: number) {
    return this.pieces
      .filter((x) => present(x) && x.cleEnveloppee && (!apres || x.id > apres))
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limite)
      .map((x) => ({ id: x.id, cle: x.cleEnveloppee ?? Buffer.alloc(0) }));
  }

  async remplacerCle(id: string, ancienne: Buffer, nouvelle: Buffer): Promise<boolean> {
    const p = this.pieces.find((x) => x.id === id);
    if (!p?.cleEnveloppee || !p.cleEnveloppee.equals(ancienne)) return false;
    p.cleEnveloppee = nouvelle;
    return true;
  }
}

interface LignePiece {
  id: string;
  practitioner_id: string;
  type: TypePiece;
  format: Format;
  taille: number;
  version_charte: string;
  cle_enveloppee: Buffer | null;
  depose_le: Date;
  supprimer_le: Date;
  supprime_le: Date | null;
}

const versPiece = (l: LignePiece): Piece => ({
  id: l.id,
  practitionerId: l.practitioner_id,
  type: l.type,
  format: l.format,
  taille: l.taille,
  versionCharte: l.version_charte,
  ...(l.cle_enveloppee ? { cleEnveloppee: l.cle_enveloppee } : {}),
  deposeLe: l.depose_le,
  supprimerLe: l.supprimer_le,
  ...(l.supprime_le ? { supprimeLe: l.supprime_le } : {}),
});

/** Requêtes paramétrées uniquement (gabarits `sql`), jamais de SQL construit par concaténation. */
export class DepotCandidaturesPostgres implements DepotCandidatures {
  constructor(private readonly sql: Sql) {}

  async insererPieceSiPlace(p: Piece, max: number): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      // Verrou par candidat et par type, libéré à la fin de la transaction.
      await tx`select pg_advisory_xact_lock(hashtext(${`pieces:${p.practitionerId}:${p.type}`}))`;
      const [compte] = await tx<{ n: number }[]>`
        select count(*)::int as n from documents.pieces_professionnels
         where practitioner_id = ${p.practitionerId} and type = ${p.type} and supprime_le is null`;
      if ((compte?.n ?? 0) >= max) return false;
      await tx`
        insert into documents.pieces_professionnels
          (id, practitioner_id, type, format, taille, version_charte, cle_enveloppee,
           depose_le, supprimer_le)
        values (${p.id}, ${p.practitionerId}, ${p.type}, ${p.format}, ${p.taille},
                ${p.versionCharte}, ${p.cleEnveloppee ?? null}, ${p.deposeLe}, ${p.supprimerLe})`;
      return true;
    });
  }

  async piecesDe(practitionerId: string): Promise<Piece[]> {
    const lignes = await this.sql<LignePiece[]>`
      select * from documents.pieces_professionnels
       where practitioner_id = ${practitionerId} and supprime_le is null
       order by depose_le desc`;
    return lignes.map(versPiece);
  }

  async piecesEchues(maintenant: Date, limite: number): Promise<Piece[]> {
    const lignes = await this.sql<LignePiece[]>`
      select * from documents.pieces_professionnels
       where supprime_le is null and supprimer_le <= ${maintenant}
       order by supprimer_le limit ${limite}`;
    return lignes.map(versPiece);
  }

  async detruireClePiece(id: string, maintenant: Date): Promise<boolean> {
    const r = await this.sql`
      update documents.pieces_professionnels set cle_enveloppee = null, supprime_le = ${maintenant}
       where id = ${id} and supprime_le is null`;
    return r.count === 1;
  }

  async enregistrerCharte(d: DecisionCharte): Promise<void> {
    await this.sql`
      insert into documents.chartes_professionnels
        (id, practitioner_id, sujet, version, accepte, decide_le)
      values (${d.id}, ${d.practitionerId}, ${d.sujet}, ${d.version}, ${d.accepte}, ${d.decideLe})`;
  }

  async derniereCharte(practitionerId: string): Promise<DecisionCharte | undefined> {
    const [l] = await this.sql<
      {
        id: string;
        practitioner_id: string;
        sujet: string;
        version: string;
        accepte: boolean;
        decide_le: Date;
      }[]
    >`
      select * from documents.chartes_professionnels where practitioner_id = ${practitionerId}
       order by decide_le desc limit 1`;
    return l
      ? {
          id: l.id,
          practitionerId: l.practitioner_id,
          sujet: l.sujet,
          version: l.version,
          accepte: l.accepte,
          decideLe: l.decide_le,
        }
      : undefined;
  }

  async clesPresentes(apres: string | undefined, limite: number) {
    const lignes = await this.sql<{ id: string; cle_enveloppee: Buffer }[]>`
      select id, cle_enveloppee from documents.pieces_professionnels
       where supprime_le is null and cle_enveloppee is not null
         and (${apres ?? null}::uuid is null or id > ${apres ?? null}::uuid)
       order by id limit ${limite}`;
    return lignes.map((l) => ({ id: l.id, cle: l.cle_enveloppee }));
  }

  async remplacerCle(id: string, ancienne: Buffer, nouvelle: Buffer): Promise<boolean> {
    const r = await this.sql`
      update documents.pieces_professionnels set cle_enveloppee = ${nouvelle}
       where id = ${id} and cle_enveloppee = ${ancienne} and supprime_le is null`;
    return r.count === 1;
  }
}

export class ErreurCandidature extends Error {
  constructor(
    message: string,
    readonly statut: 400 | 403 | 409 | 413 | 415,
  ) {
    super(message);
  }
}

export interface ParametresCandidature {
  /** Version de la charte C-VERIFICATION-PRO en vigueur (texte validé par le juriste). */
  versionCharte: string;
  /** Conservation des pièces, en jours (ADR-0026 q. 5 : durée à fixer avec le juriste). */
  conservationJours: number;
  /** Pièces présentes au plus, par type (recto et verso, ou deux pages). */
  maxParType: number;
  /** Spécialités ouvertes dans le pays (codes de SPECIALITES, liste fermée). */
  specialites: readonly string[];
  /** Langues de consultation proposées (codes BCP 47, liste fermée par pays). */
  langues: readonly string[];
}

export interface EtatCandidature {
  practitionerId: string;
  charte: { version: string; acceptee: boolean };
  /** Statut de la vérification lu dans la fiche ; la déclaration n'est modifiable qu'« a-verifier ». */
  statut: StatutVerificationPro | 'inconnu';
  declaration?: Declaration;
  /** Pièces présentes : type et date seulement, jamais le contenu. */
  pieces: { type: TypePiece; deposeLe: string }[];
}

export interface PieceDeposee {
  id: string;
  type: TypePiece;
  format: Format;
  supprimerLe: string;
}

export class ServiceCandidature {
  constructor(
    private readonly depot: DepotCandidatures,
    private readonly stockage: Stockage,
    private readonly maitre: CleMaitre,
    private readonly fiches: FichesPraticiens,
    private readonly parametres: ParametresCandidature,
    private readonly horloge: () => Date = () => new Date(),
  ) {
    if (!Number.isInteger(parametres.conservationJours) || parametres.conservationJours < 1) {
      throw new Error('Durée de conservation des pièces invalide.');
    }
    if (!Number.isInteger(parametres.maxParType) || parametres.maxParType < 1) {
      throw new Error('Nombre maximal de pièces par type invalide.');
    }
    if (!/^[A-Za-z0-9.-]{1,32}$/.test(parametres.versionCharte)) {
      throw new Error('Version de la charte invalide.');
    }
    if (parametres.specialites.length === 0 || !parametres.specialites.every(estSpecialite)) {
      throw new Error('Liste des spécialités invalide.');
    }
    if (
      parametres.langues.length === 0 ||
      !parametres.langues.every((l) => /^[a-z]{2,3}$/.test(l))
    ) {
      throw new Error('Liste des langues de consultation invalide.');
    }
  }

  /**
   * Le candidat lui-même, avec sa fiche, jamais un agent IA. Pas de flag ici : seul un compte créé
   * avec un code d'invitation (flag professionnels.recrutement) porte ce rôle.
   */
  private candidat(u: Utilisateur): string {
    if (
      !u.roles.includes(ROLE_CANDIDAT) ||
      !u.practitionerId ||
      u.agent ||
      u.roles.includes('agent-ia')
    ) {
      throw new ErreurCandidature('Accès refusé.', 403);
    }
    return u.practitionerId;
  }

  private async charteAcceptee(practitionerId: string): Promise<boolean> {
    const d = await this.depot.derniereCharte(practitionerId);
    return !!d && d.accepte && d.version === this.parametres.versionCharte;
  }

  async etat(u: Utilisateur): Promise<EtatCandidature> {
    const practitionerId = this.candidat(u);
    const [acceptee, pieces, lue] = await Promise.all([
      this.charteAcceptee(practitionerId),
      this.depot.piecesDe(practitionerId),
      this.fiches.lire(practitionerId),
    ]);
    const declaration = lue && declarationDe(lue.fiche);
    return {
      practitionerId,
      charte: { version: this.parametres.versionCharte, acceptee },
      statut: (lue && statutVerification(lue.fiche)) ?? 'inconnu',
      ...(declaration ? { declaration } : {}),
      pieces: pieces.map((p) => ({ type: p.type, deposeLe: p.deposeLe.toISOString() })),
    };
  }

  /** Accord ou refus de la charte, par le candidat lui-même, pour la version qu'il a lue. */
  async deciderCharte(u: Utilisateur, d: { version: string; accepte: boolean }): Promise<void> {
    const practitionerId = this.candidat(u);
    if (d.version !== this.parametres.versionCharte) {
      throw new ErreurCandidature('Cette version de la charte n’est plus en vigueur.', 409);
    }
    await this.depot.enregistrerCharte({
      id: randomUUID(),
      practitionerId,
      sujet: u.sujet,
      version: d.version,
      accepte: d.accepte,
      decideLe: this.horloge(),
    });
  }

  /**
   * Déclaration du candidat lui-même, après la charte, tant que sa fiche est « à vérifier » et
   * inactive : la passerelle ne remplace que `qualification` et `communication`, et refuse
   * l'écriture si une décision est arrivée depuis la lecture (verrou optimiste → 409).
   */
  async declarer(u: Utilisateur, d: Declaration): Promise<void> {
    const practitionerId = this.candidat(u);
    if (!(await this.charteAcceptee(practitionerId))) {
      throw new ErreurCandidature('Acceptez d’abord la charte.', 409);
    }
    if (!this.parametres.specialites.includes(d.specialite)) {
      throw new ErreurCandidature('Spécialité non proposée.', 400);
    }
    if (!d.langues.every((l) => this.parametres.langues.includes(l))) {
      throw new ErreurCandidature('Langue non proposée.', 400);
    }
    let elements: ReturnType<typeof declarationPraticien>;
    try {
      elements = declarationPraticien(d);
    } catch (e) {
      throw new ErreurCandidature((e as Error).message, 400);
    }
    const lue = await this.fiches.lire(practitionerId);
    if (!lue) throw new ErreurCandidature('Fiche introuvable.', 403);
    if (lue.fiche.active !== false || statutVerification(lue.fiche) !== 'a-verifier') {
      throw new ErreurCandidature('Votre dossier n’est plus modifiable.', 409);
    }
    await this.fiches.declarer(practitionerId, elements, lue.version);
  }

  async deposer(u: Utilisateur, type: string, octets: Buffer): Promise<PieceDeposee> {
    const practitionerId = this.candidat(u);
    if (!(TYPES_PIECE as readonly string[]).includes(type)) {
      throw new ErreurCandidature('Type de pièce inconnu.', 400);
    }
    if (!(await this.charteAcceptee(practitionerId))) {
      throw new ErreurCandidature('Acceptez d’abord la charte.', 409);
    }
    if (octets.length === 0 || octets.length > TAILLE_MAX) {
      throw new ErreurCandidature('Photo vide ou trop lourde (2 Mo au plus).', 413);
    }
    const format = reconnaitre(octets);
    if (!format) throw new ErreurCandidature('Seules les photos JPEG ou PNG sont acceptées.', 415);
    const typePiece = type as TypePiece;
    const trop = () => new ErreurCandidature('Nombre maximal de pièces atteint pour ce type.', 409);
    // Contrôle rapide avant d'écrire ; la limite est garantie par l'insertion sous verrou.
    const deja = (await this.depot.piecesDe(practitionerId)).filter((p) => p.type === typePiece);
    if (deja.length >= this.parametres.maxParType) throw trop();
    const id = randomUUID();
    const maintenant = this.horloge();
    const { donnees, cleEnveloppee } = await chiffrer(octets, id, this.maitre);
    const piece: Piece = {
      id,
      practitionerId,
      type: typePiece,
      format,
      taille: octets.length,
      versionCharte: this.parametres.versionCharte,
      cleEnveloppee,
      deposeLe: maintenant,
      supprimerLe: new Date(maintenant.getTime() + this.parametres.conservationJours * 86_400_000),
    };
    await this.stockage.ecrire(id, donnees);
    let insere: boolean;
    try {
      insere = await this.depot.insererPieceSiPlace(piece, this.parametres.maxParType);
    } catch (e) {
      // Sans métadonnées, le contenu chiffré n'a plus de clé : on le retire.
      await this.stockage.supprimer(id).catch(() => undefined);
      throw e;
    }
    if (!insere) {
      await this.stockage.supprimer(id).catch(() => undefined);
      throw trop();
    }
    return { id, type: typePiece, format, supprimerLe: piece.supprimerLe.toISOString() };
  }

  /** Suppression à échéance : clé détruite d'abord, puis objet. Retourne le nombre traité. */
  async supprimerEchus(limite = 100): Promise<number> {
    const maintenant = this.horloge();
    let n = 0;
    for (const p of await this.depot.piecesEchues(maintenant, limite)) {
      if (await this.depot.detruireClePiece(p.id, maintenant)) {
        await this.stockage.supprimer(p.id).catch(() => undefined);
        n++;
      }
    }
    return n;
  }
}
