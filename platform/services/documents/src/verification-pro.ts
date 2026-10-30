// Vérification des professionnels de santé (ADR-0026, étape 4), rôle verification-professionnels
// (double authentification, jamais un agent IA, aucun accès clinique) :
// - liste des candidats dont le dossier attend une décision ;
// - dossier (déclaration, pièces) : chaque consultation est tracée dans le dossier AVANT d'être
//   montrée (sans trace, rien n'est montré) ;
// - décision « vérifié » (tous les points contrôlés à la source, fin de validité), « refusé » (motif
//   codé) ou « à compléter » (pièces à refaire, effacées).
// Séparation des tâches : jamais le candidat qu'on a recruté (demandé au service invitations).
// L'activation est faite par le serveur : fiche active et « verifie » ; le rôle Keycloak suit à la
// connexion du candidat (étape 4b).
// Étape 5 (décisions du porteur de projet du 2026-10-29) : validité retenue d'au plus un an ;
// suspension d'un professionnel vérifié (motif codé) ; la fiche suspendue revient dans la liste et
// seule une nouvelle vérification complète la réactive.
import { randomUUID } from 'node:crypto';
import type { Sql } from '@mbolo/base-donnees';
import {
  activationPraticien,
  declarationDe,
  SPECIALITES,
  evenementVerificationPro,
  statutPraticien,
  statutVerification,
  type Declaration,
  type Environnement,
  type StatutVerificationPro,
} from '@mbolo/dossier-fhir';
import type { Utilisateur } from '@mbolo/identite';
import type { DepotCandidatures, DepotCandidaturesMemoire, TypePiece } from './candidature.js';
import { dechiffrer, type CleMaitre } from './chiffrement.js';
import type { FichesPraticiens } from './dossier.js';
import type { Format } from './format.js';
import type { Recruteurs } from './recruteurs.js';
import type { Stockage } from './stockage.js';

export const ROLE_VERIFICATION_PRO = 'verification-professionnels';

/** Points contrôlés à la source (ADR-0026) ; tous conformes pour « vérifié ». */
export const POINTS = ['identite', 'diplome', 'inscription', 'specialite'] as const;
export type Point = (typeof POINTS)[number];
/** Sources consultées (liste fermée, jamais une adresse ou un texte libre). */
export const SOURCES = [
  'registre-ordre',
  'attestation-ordre',
  'document-original',
  'entretien-video',
] as const;
export type Source = (typeof SOURCES)[number];
/** Motifs de refus (liste provisoire, à valider par le porteur de projet). */
export const MOTIFS_REFUS_PRO = [
  'diplome-non-confirme',
  'inscription-introuvable',
  'inscription-non-valable',
  'identite-non-confirmee',
  'specialite-non-confirmee',
  'pieces-non-conformes',
] as const;
export type MotifRefusPro = (typeof MOTIFS_REFUS_PRO)[number];
export const RESULTATS_PRO = ['verifie', 'refuse', 'a-completer'] as const;
export type ResultatPro = (typeof RESULTATS_PRO)[number];
/** Motifs de suspension (ADR-0026, liste provisoire, à valider par le porteur de projet). */
export const MOTIFS_SUSPENSION = [
  'signalement-ordre',
  'plainte-confirmee',
  'incident-qualite-confirme',
] as const;
export type MotifSuspension = (typeof MOTIFS_SUSPENSION)[number];
/** Ce qui est gardé dans le dépôt : une décision sur un dossier, ou une suspension. */
export type ResultatEnregistre = ResultatPro | 'suspendu';
/** Durée maximale d'une vérification : au-delà, on revérifie (décision du 2026-10-29). */
export const VALIDITE_MAX_MOIS = 12;

/** Une fiche suspendue attend, comme une fiche à vérifier, une nouvelle décision complète. */
const EN_ATTENTE: readonly (StatutVerificationPro | undefined)[] = ['a-verifier', 'suspendu'];

/** Pièces sans lesquelles un dossier ne peut pas être vérifié (l'assurance dépend du juriste). */
const PIECES_REQUISES: readonly TypePiece[] = ['diplome', 'inscription-ordre', 'piece-identite'];

export interface Controle {
  point: Point;
  source: Source;
  /** Date de consultation de la source (AAAA-MM-JJ). */
  consulteLe: string;
  conforme: boolean;
}

export interface DecisionPro {
  id: string;
  practitionerId: string;
  verificateur: string;
  resultat: ResultatEnregistre;
  motif?: MotifRefusPro | MotifSuspension;
  controles: Controle[];
  piecesARefaire: TypePiece[];
  finValidite?: string;
  decideLe: Date;
}

export interface DepotDecisionsPro {
  enregistrer(d: DecisionPro): Promise<void>;
  /** Décisions de la fiche, les plus récentes d'abord. */
  decisionsDe(practitionerId: string, limite: number): Promise<DecisionPro[]>;
  /** Fiches qui ont au moins une pièce présente, la plus ancienne attente d'abord. */
  candidatsAvecPieces(limite: number): Promise<{ practitionerId: string; depuis: Date }[]>;
  /** Fiches dont la dernière décision (hors « à compléter ») est une suspension, la plus ancienne d'abord. */
  suspendus(limite: number): Promise<{ practitionerId: string; depuis: Date }[]>;
}

export class ErreurVerificationPro extends Error {
  constructor(
    message: string,
    readonly statut: 403 | 404 | 409 | 422 | 503,
  ) {
    super(message);
  }
}

export interface DemandeDecisionPro {
  resultat: ResultatPro;
  controles: Controle[];
  motif?: MotifRefusPro;
  piecesARefaire?: TypePiece[];
  /** Pour « vérifié » : période de validité de l'inscription retenue (AAAA-MM-JJ). */
  validite?: { debut: string; fin: string };
}

export interface DossierCandidat {
  practitionerId: string;
  statut: StatutVerificationPro | 'inconnu';
  nom?: string;
  prenoms: string[];
  declaration?: Declaration & { specialiteLibelle: string };
  pieces: { id: string; type: TypePiece; deposeLe: string }[];
  decisions: {
    resultat: ResultatEnregistre;
    motif?: MotifRefusPro | MotifSuspension;
    decideLe: string;
  }[];
}

export class ServiceVerificationPro {
  constructor(
    private readonly decisions: DepotDecisionsPro,
    private readonly candidatures: DepotCandidatures,
    private readonly stockage: Stockage,
    private readonly maitre: CleMaitre,
    private readonly fiches: FichesPraticiens,
    private readonly recruteurs: Recruteurs,
    private readonly env: Environnement,
    private readonly horloge: () => Date = () => new Date(),
  ) {}

  /** Personne habilitée, jamais un agent IA, jamais pour sa propre fiche. */
  private exigerRole(u: Utilisateur, practitionerId?: string): void {
    if (
      !u.roles.includes(ROLE_VERIFICATION_PRO) ||
      u.agent ||
      u.roles.includes('agent-ia') ||
      (practitionerId !== undefined && u.practitionerId === practitionerId)
    ) {
      throw new ErreurVerificationPro('Accès refusé.', 403);
    }
  }

  /** Séparation des tâches : sans réponse du service invitations, rien n'est montré ni décidé. */
  private async exigerNonRecruteur(u: Utilisateur, practitionerId: string): Promise<void> {
    let recruteurs: string[];
    try {
      recruteurs = await this.recruteurs.de(practitionerId);
    } catch {
      throw new ErreurVerificationPro('Vérification momentanément indisponible.', 503);
    }
    if (recruteurs.includes(u.sujet)) {
      throw new ErreurVerificationPro(
        'Vous avez recruté ce candidat : une autre personne doit le vérifier.',
        403,
      );
    }
  }

  /** Trace dans le dossier, avant de montrer quoi que ce soit (échec : rien n'est montré). */
  private async tracer(
    u: Utilisateur,
    practitionerId: string,
    objet: string,
    action: 'R' | 'U',
  ): Promise<void> {
    await this.fiches.tracer(
      evenementVerificationPro({
        practitionerId,
        sujet: u.sujet,
        roles: u.roles,
        objet,
        action,
        date: this.horloge().toISOString(),
        env: this.env,
      }),
    );
  }

  async aVerifier(u: Utilisateur): Promise<{ practitionerId: string; depuis: string }[]> {
    this.exigerRole(u);
    const candidats = new Map<string, Date>();
    for (const c of [
      ...(await this.decisions.candidatsAvecPieces(50)),
      ...(await this.decisions.suspendus(50)),
    ]) {
      const d = candidats.get(c.practitionerId);
      if (!d || c.depuis < d) candidats.set(c.practitionerId, c.depuis);
    }
    const liste = [];
    for (const [practitionerId, depuis] of [...candidats].sort((a, b) => +a[1] - +b[1])) {
      if (practitionerId === u.practitionerId) continue;
      const lue = await this.fiches.lire(practitionerId);
      if (lue && lue.fiche.active !== true && EN_ATTENTE.includes(statutVerification(lue.fiche))) {
        liste.push({ practitionerId, depuis: depuis.toISOString() });
      }
    }
    return liste;
  }

  async dossier(u: Utilisateur, practitionerId: string): Promise<DossierCandidat> {
    this.exigerRole(u, practitionerId);
    await this.exigerNonRecruteur(u, practitionerId);
    const lue = await this.fiches.lire(practitionerId);
    if (!lue) throw new ErreurVerificationPro('Fiche introuvable.', 404);
    await this.tracer(u, practitionerId, 'dossier', 'R');
    const nom = lue.fiche.name?.[0];
    const declaration = declarationDe(lue.fiche);
    return {
      practitionerId,
      statut: statutVerification(lue.fiche) ?? 'inconnu',
      ...(nom?.family ? { nom: nom.family } : {}),
      prenoms: nom?.given ?? [],
      ...(declaration
        ? {
            declaration: { ...declaration, specialiteLibelle: SPECIALITES[declaration.specialite] },
          }
        : {}),
      pieces: (await this.candidatures.piecesDe(practitionerId)).map((p) => ({
        id: p.id,
        type: p.type,
        deposeLe: p.deposeLe.toISOString(),
      })),
      decisions: (await this.decisions.decisionsDe(practitionerId, 10)).map((d) => ({
        resultat: d.resultat,
        ...(d.motif ? { motif: d.motif } : {}),
        decideLe: d.decideLe.toISOString(),
      })),
    };
  }

  async piece(
    u: Utilisateur,
    practitionerId: string,
    pieceId: string,
  ): Promise<{ format: Format; octets: Buffer }> {
    this.exigerRole(u, practitionerId);
    await this.exigerNonRecruteur(u, practitionerId);
    // Même réponse si la pièce n'existe pas, est supprimée ou appartient à une autre fiche.
    const p = (await this.candidatures.piecesDe(practitionerId)).find((x) => x.id === pieceId);
    const donnees = p?.cleEnveloppee ? await this.stockage.lire(p.id) : undefined;
    if (!p?.cleEnveloppee || !donnees) {
      throw new ErreurVerificationPro('Pièce introuvable.', 404);
    }
    await this.tracer(u, practitionerId, p.type, 'R');
    return {
      format: p.format,
      octets: await dechiffrer(donnees, p.cleEnveloppee, p.id, this.maitre),
    };
  }

  async decider(
    u: Utilisateur,
    practitionerId: string,
    demande: DemandeDecisionPro,
  ): Promise<{ resultat: ResultatPro }> {
    this.exigerRole(u, practitionerId);
    await this.exigerNonRecruteur(u, practitionerId);
    const lue = await this.fiches.lire(practitionerId);
    if (!lue) throw new ErreurVerificationPro('Fiche introuvable.', 404);
    if (lue.fiche.active !== false || !EN_ATTENTE.includes(statutVerification(lue.fiche))) {
      throw new ErreurVerificationPro('Ce dossier n’attend pas de décision.', 409);
    }
    const pieces = await this.candidatures.piecesDe(practitionerId);
    const maintenant = this.horloge();
    const aujourdhui = maintenant.toISOString().slice(0, 10);
    const points = new Set(demande.controles.map((c) => c.point));
    if (points.size !== demande.controles.length) {
      throw new ErreurVerificationPro('Un point est contrôlé deux fois.', 422);
    }
    if (demande.controles.some((c) => c.consulteLe > aujourdhui)) {
      throw new ErreurVerificationPro('Une source ne peut pas être consultée dans le futur.', 422);
    }
    if ((demande.resultat === 'refuse') !== (demande.motif !== undefined)) {
      throw new ErreurVerificationPro('Un motif accompagne un refus, et seulement un refus.', 422);
    }
    const aRefaire = [...new Set(demande.piecesARefaire ?? [])];
    if ((demande.resultat === 'a-completer') !== aRefaire.length > 0) {
      throw new ErreurVerificationPro(
        'Indiquez les pièces à refaire, seulement pour compléter.',
        422,
      );
    }
    if ((demande.resultat === 'verifie') !== (demande.validite !== undefined)) {
      throw new ErreurVerificationPro('La validité accompagne seulement une vérification.', 422);
    }

    let elements;
    if (demande.resultat === 'verifie') {
      const v = demande.validite;
      if (
        !POINTS.every((pt) => demande.controles.some((c) => c.point === pt && c.conforme)) ||
        !PIECES_REQUISES.every((t) => pieces.some((p) => p.type === t)) ||
        !declarationDe(lue.fiche)
      ) {
        throw new ErreurVerificationPro(
          'Vérifié exige la déclaration, les pièces et les quatre points conformes.',
          422,
        );
      }
      const max = new Date(maintenant);
      max.setUTCMonth(max.getUTCMonth() + VALIDITE_MAX_MOIS);
      if (
        !v ||
        v.debut > aujourdhui ||
        v.fin <= aujourdhui ||
        v.fin <= v.debut ||
        v.fin > max.toISOString().slice(0, 10)
      ) {
        throw new ErreurVerificationPro(
          'Période de validité invalide (fin dans un an au plus).',
          422,
        );
      }
      elements = activationPraticien(lue.fiche, v);
    } else if (demande.resultat === 'refuse') {
      elements = statutPraticien(lue.fiche, 'refuse');
    }

    // Trace d'abord : sans elle, aucune décision n'est appliquée.
    await this.tracer(u, practitionerId, `decision-${demande.resultat}`, 'U');
    if (elements) await this.fiches.decider(practitionerId, elements, lue.version);
    if (demande.resultat === 'a-completer') {
      // Les pièces à refaire deviennent illisibles (clé détruite), puis l'objet est supprimé ; le
      // candidat en dépose de nouvelles. La fiche reste « à vérifier ».
      for (const p of pieces.filter((x) => aRefaire.includes(x.type))) {
        if (await this.candidatures.detruireClePiece(p.id, maintenant)) {
          await this.stockage.supprimer(p.id).catch(() => undefined);
        }
      }
    }
    await this.decisions.enregistrer({
      id: randomUUID(),
      practitionerId,
      verificateur: u.sujet,
      resultat: demande.resultat,
      ...(demande.motif ? { motif: demande.motif } : {}),
      controles: demande.controles,
      piecesARefaire: aRefaire,
      ...(demande.validite ? { finValidite: demande.validite.fin } : {}),
      decideLe: maintenant,
    });
    return { resultat: demande.resultat };
  }

  /**
   * Suspension d'un professionnel vérifié : fiche inactive et « suspendu », effet immédiat sur
   * l'annuaire, les créneaux et l'accès aux dossiers (fiche relue sans cache). Mesure de sécurité :
   * elle ne dépend pas du service invitations (une panne ne doit pas l'empêcher).
   */
  async suspendre(
    u: Utilisateur,
    practitionerId: string,
    motif: MotifSuspension,
  ): Promise<{ resultat: 'suspendu' }> {
    this.exigerRole(u, practitionerId);
    const lue = await this.fiches.lire(practitionerId);
    if (!lue) throw new ErreurVerificationPro('Fiche introuvable.', 404);
    if (statutVerification(lue.fiche) !== 'verifie') {
      throw new ErreurVerificationPro('Seul un professionnel vérifié peut être suspendu.', 409);
    }
    await this.tracer(u, practitionerId, 'suspension', 'U');
    await this.fiches.decider(practitionerId, statutPraticien(lue.fiche, 'suspendu'), lue.version);
    await this.decisions.enregistrer({
      id: randomUUID(),
      practitionerId,
      verificateur: u.sujet,
      resultat: 'suspendu',
      motif,
      controles: [],
      piecesARefaire: [],
      decideLe: this.horloge(),
    });
    return { resultat: 'suspendu' };
  }
}

export class DepotDecisionsProMemoire implements DepotDecisionsPro {
  readonly decisions: DecisionPro[] = [];
  /** Les candidats en attente se lisent dans les pièces du dépôt des candidatures. */
  constructor(private readonly candidatures?: DepotCandidaturesMemoire) {}

  async enregistrer(d: DecisionPro): Promise<void> {
    this.decisions.push(structuredClone(d));
  }

  async decisionsDe(practitionerId: string, limite: number): Promise<DecisionPro[]> {
    return this.decisions
      .filter((d) => d.practitionerId === practitionerId)
      .sort((a, b) => b.decideLe.getTime() - a.decideLe.getTime())
      .slice(0, limite)
      .map((d) => structuredClone(d));
  }

  async suspendus(limite: number) {
    const derniere = new Map<string, DecisionPro>();
    // « À compléter » ne change pas le statut de la fiche : la suspension reste la dernière décision.
    for (const d of this.decisions.filter((x) => x.resultat !== 'a-completer')) {
      const avant = derniere.get(d.practitionerId);
      if (!avant || d.decideLe >= avant.decideLe) derniere.set(d.practitionerId, d);
    }
    return [...derniere.values()]
      .filter((d) => d.resultat === 'suspendu')
      .sort((a, b) => a.decideLe.getTime() - b.decideLe.getTime())
      .slice(0, limite)
      .map((d) => ({ practitionerId: d.practitionerId, depuis: d.decideLe }));
  }

  async candidatsAvecPieces(limite: number) {
    const depuis = new Map<string, Date>();
    for (const p of this.candidatures?.pieces ?? []) {
      if (p.supprimeLe) continue;
      const d = depuis.get(p.practitionerId);
      if (!d || p.deposeLe > d) depuis.set(p.practitionerId, p.deposeLe);
    }
    return [...depuis]
      .map(([practitionerId, d]) => ({ practitionerId, depuis: d }))
      .sort((a, b) => a.depuis.getTime() - b.depuis.getTime())
      .slice(0, limite);
  }
}

interface LigneDecision {
  id: string;
  practitioner_id: string;
  verificateur: string;
  resultat: ResultatEnregistre;
  motif: MotifRefusPro | MotifSuspension | null;
  controles: Controle[];
  pieces_a_refaire: TypePiece[];
  fin_validite: Date | null;
  decide_le: Date;
}

/** Requêtes paramétrées uniquement (gabarits `sql`). */
export class DepotDecisionsProPostgres implements DepotDecisionsPro {
  constructor(private readonly sql: Sql) {}

  async enregistrer(d: DecisionPro): Promise<void> {
    await this.sql`
      insert into documents.decisions_professionnels
        (id, practitioner_id, verificateur, resultat, motif, controles, pieces_a_refaire,
         fin_validite, decide_le)
      values (${d.id}, ${d.practitionerId}, ${d.verificateur}, ${d.resultat}, ${d.motif ?? null},
              ${this.sql.json(d.controles as unknown as Parameters<Sql['json']>[0])},
              ${d.piecesARefaire}, ${d.finValidite ?? null}, ${d.decideLe})`;
  }

  async decisionsDe(practitionerId: string, limite: number): Promise<DecisionPro[]> {
    const lignes = await this.sql<LigneDecision[]>`
      select * from documents.decisions_professionnels where practitioner_id = ${practitionerId}
       order by decide_le desc limit ${limite}`;
    return lignes.map((l) => ({
      id: l.id,
      practitionerId: l.practitioner_id,
      verificateur: l.verificateur,
      resultat: l.resultat,
      ...(l.motif ? { motif: l.motif } : {}),
      controles: l.controles,
      piecesARefaire: l.pieces_a_refaire,
      ...(l.fin_validite ? { finValidite: l.fin_validite.toISOString().slice(0, 10) } : {}),
      decideLe: l.decide_le,
    }));
  }

  async candidatsAvecPieces(limite: number) {
    const lignes = await this.sql<{ practitioner_id: string; depuis: Date }[]>`
      select practitioner_id, max(depose_le) as depuis from documents.pieces_professionnels
       where supprime_le is null
       group by practitioner_id order by depuis limit ${limite}`;
    return lignes.map((l) => ({ practitionerId: l.practitioner_id, depuis: l.depuis }));
  }

  async suspendus(limite: number) {
    const lignes = await this.sql<{ practitioner_id: string; depuis: Date }[]>`
      select practitioner_id, decide_le as depuis from (
        select distinct on (practitioner_id) practitioner_id, resultat, decide_le
          from documents.decisions_professionnels where resultat <> 'a-completer'
         order by practitioner_id, decide_le desc) derniere
       where resultat = 'suspendu' order by depuis limit ${limite}`;
    return lignes.map((l) => ({ practitionerId: l.practitioner_id, depuis: l.depuis }));
  }
}
