// Consultation clinique côté professionnel.
// - Lecture du dossier : seulement après une décision d'accès favorable du service identite
//   (consentement C-PARTAGE-PRO ou bris de glace motivé), décision prise avec le jeton du demandeur.
// - Compte-rendu : rédigé par le professionnel du rendez-vous, jamais par un agent IA
//   (principe n°1, invariant mbolo-cr-1), à partir de l'ouverture de la salle, avec la même
//   décision d'accès que pour la lecture.
// - Ordonnance (ADR-0018, flag ordonnances.electroniques) : prescrite par le professionnel du
//   rendez-vous, mêmes conditions que le compte-rendu ; médicaments de la nomenclature du pays,
//   posologie structurée, aucun texte libre ; révocable par son prescripteur tant qu'elle est active.
//   La signature et la délivrance en pharmacie viendront avec l'avis juridique (D-0003).
// - Mes documents : le patient lui-même lit ses comptes-rendus et ses ordonnances, tels que le
//   professionnel les a écrits (aucune IA ne les résume ni ne les reformule) ; lecture tracée par
//   identite comme tout accès au dossier.
import { randomBytes } from 'node:crypto';
import type { Composition, Condition, MedicationRequest } from 'fhir/r4.js';
import {
  compteRendu,
  ordonnance,
  RENOUVELLEMENTS_MAX,
  SECTIONS_COMPTE_RENDU,
  texteSection,
  valider,
  type Environnement,
  type LigneOrdonnance,
  type SectionCompteRendu,
} from '@mbolo/dossier-fhir';
import type { Drapeaux } from '@mbolo/drapeaux';
import type { Utilisateur } from '@mbolo/identite';
import type { DecideurAcces } from './acces.js';
import type { Dossier, DossierOrdonnances } from './dossier.js';

/** Ordonnances : dépôt, flag et paramètres du pays déployé. */
export interface OptionsOrdonnances {
  dossier: DossierOrdonnances;
  drapeaux: Pick<Drapeaux, 'estActif'>;
  /** Système de la nomenclature des médicaments du pays (ATC en attendant la liste nationale). */
  nomenclature: string;
  /** Validité d'une ordonnance, en jours (à confirmer par le comité médical et le juriste). */
  validiteJours: number;
}

/** Une ligne d'ordonnance telle que le professionnel la saisit. */
export type LigneSaisie = LigneOrdonnance;

export interface ResumeOrdonnance {
  numero: string;
  statut: 'active' | 'revoquee' | 'autre';
  patientId: string;
  prescriteLe: string;
  valableJusquau: string;
  lignes: {
    medicament: string;
    dose: string;
    /** Structurée : chaque application la formule dans la langue du pays. */
    frequence: { fois: number; periode: number; unite: string };
    dureeJours: number;
  }[];
}

/** Lignes par ordonnance au plus. */
export const LIGNES_MAX = 10;

export class ErreurConsultation extends Error {
  constructor(
    message: string,
    readonly statut: 400 | 403 | 404 | 409,
    readonly motif?: string,
  ) {
    super(message);
    this.name = 'ErreurConsultation';
  }
}

export interface ProblemeResume {
  texte: string;
  /** confirmed, unconfirmed… (statut de vérification FHIR). */
  verification: string;
  date?: string;
  /** Posé par un professionnel (sinon : déclaré par le patient ou un proche). */
  parProfessionnel: boolean;
}

export interface CompteRenduResume {
  id: string;
  date: string;
  sections: Partial<Record<SectionCompteRendu, string>>;
}

/** Ce que le patient voit de son dossier : comptes-rendus et ordonnances, les plus récents d'abord. */
export interface MesDocuments {
  comptesRendus: CompteRenduResume[];
  ordonnances: ResumeOrdonnance[];
}

export interface ResumeDossier {
  motifAcces: string;
  problemes: ProblemeResume[];
  comptesRendus: CompteRenduResume[];
}

/** La salle ouvre 15 min avant le rendez-vous (ADR-0011) : le compte-rendu aussi. */
const AVANT_MS = 15 * 60_000;
const LONGUEUR_MAX = 4_000;

const versProbleme = (c: Condition): ProblemeResume => ({
  texte: c.code?.text ?? c.code?.coding?.[0]?.display ?? 'Sans libellé',
  verification: c.verificationStatus?.coding?.[0]?.code ?? 'inconnu',
  ...(c.recordedDate ? { date: c.recordedDate } : {}),
  parProfessionnel: c.asserter?.reference?.startsWith('Practitioner/') === true,
});

const versCompteRendu = (c: Composition): CompteRenduResume => ({
  id: c.id ?? '',
  date: c.date,
  sections: Object.fromEntries(
    SECTIONS_COMPTE_RENDU.map((s) => [s, texteSection(c, s)]).filter(([, t]) => t !== undefined),
  ),
});

export class ServiceConsultation {
  constructor(
    private readonly acces: DecideurAcces,
    private readonly dossierFhir: Dossier,
    private readonly env: Environnement,
    private readonly maintenant: () => Date = () => new Date(),
    private readonly ordonnances?: OptionsOrdonnances,
  ) {}

  private async exigerAcces(jeton: string, patientId: string, brisDeGlace?: { motif: string }) {
    const d = await this.acces.decider(jeton, patientId, brisDeGlace);
    if (!d.autorise) {
      throw new ErreurConsultation('Accès au dossier refusé.', 403, d.motif);
    }
    return d;
  }

  async dossier(
    jeton: string,
    patientId: string,
    brisDeGlace?: { motif: string },
  ): Promise<ResumeDossier> {
    const d = await this.exigerAcces(jeton, patientId, brisDeGlace);
    const [problemes, comptesRendus] = await Promise.all([
      this.dossierFhir.problemes(patientId),
      this.dossierFhir.comptesRendus(patientId),
    ]);
    return {
      motifAcces: d.motif,
      problemes: problemes.map(versProbleme),
      comptesRendus: comptesRendus
        .map(versCompteRendu)
        .sort((a, b) => b.date.localeCompare(a.date)),
    };
  }

  /**
   * Comptes-rendus et ordonnances du patient connecté, pour lui seul (ni proche ni agent IA pour
   * l'instant). La lecture passe par la décision d'identite, qui la consigne (AuditEvent).
   */
  async mesDocuments(u: Utilisateur, jeton: string): Promise<MesDocuments> {
    if (!u.roles.includes('patient') || !u.patientId || u.agent) {
      throw new ErreurConsultation('Réservé au patient lui-même.', 403);
    }
    const patientId = u.patientId;
    await this.exigerAcces(jeton, patientId);
    const [comptesRendus, lignes] = await Promise.all([
      this.dossierFhir.comptesRendus(patientId),
      this.ordonnances?.dossier.lignesDuPatient(patientId) ?? Promise.resolve([]),
    ]);
    // Une ordonnance = les lignes qui partagent un numéro ; les lignes écrites par erreur sont exclues.
    const parNumero = new Map<string, MedicationRequest[]>();
    for (const l of lignes) {
      const numero = l.groupIdentifier?.value;
      if (!numero || l.status === 'entered-in-error') continue;
      parNumero.set(numero, [...(parNumero.get(numero) ?? []), l]);
    }
    return {
      comptesRendus: comptesRendus
        .filter((c) => c.status !== 'entered-in-error')
        .map(versCompteRendu)
        .sort((a, b) => b.date.localeCompare(a.date)),
      ordonnances: [...parNumero]
        .map(([numero, l]) => resumer(numero, l))
        .sort((a, b) => b.prescriteLe.localeCompare(a.prescriteLe)),
    };
  }

  async ecrireCompteRendu(
    u: Utilisateur,
    jeton: string,
    rendezVousId: string,
    sections: Partial<Record<SectionCompteRendu, string>>,
  ): Promise<{ id: string }> {
    if (!u.roles.includes('professionnel') || !u.practitionerId) {
      throw new ErreurConsultation('Seul un professionnel de santé rédige un compte-rendu.', 403);
    }
    const textes = Object.values(sections).filter((t) => t?.trim());
    if (textes.length === 0) {
      throw new ErreurConsultation('Le compte-rendu est vide.', 400);
    }
    if (textes.some((t) => (t?.length ?? 0) > LONGUEUR_MAX)) {
      throw new ErreurConsultation('Section trop longue.', 400);
    }
    const patientId = await this.patientDuRendezVous(u, jeton, rendezVousId);
    const cree = await this.dossierFhir.ajouterCompteRendu(
      compteRendu({
        patientId,
        praticienId: u.practitionerId,
        rendezVousId,
        date: this.maintenant().toISOString(),
        sections,
        env: this.env,
      }),
    );
    return { id: cree.id ?? '' };
  }

  /**
   * Patient d'un rendez-vous du professionnel connecté, commencé (salle ouverte), avec une décision
   * d'accès favorable : conditions communes au compte-rendu et à l'ordonnance.
   */
  private async patientDuRendezVous(
    u: Utilisateur,
    jeton: string,
    rendezVousId: string,
  ): Promise<string> {
    const r = await this.dossierFhir.rendezVous(rendezVousId);
    const acteur = (prefixe: string) =>
      r?.participant
        .map((p) => p.actor?.reference ?? '')
        .find((x) => x.startsWith(prefixe))
        ?.slice(prefixe.length);
    // Même réponse si le rendez-vous n'existe pas ou n'est pas le sien : rien n'est révélé.
    const patientId = acteur('Patient/');
    if (!r || !patientId || acteur('Practitioner/') !== u.practitionerId) {
      throw new ErreurConsultation('Rendez-vous introuvable.', 404);
    }
    if (r.status !== 'booked') {
      throw new ErreurConsultation('Rendez-vous annulé.', 409);
    }
    if (this.maintenant().getTime() < new Date(r.start ?? 0).getTime() - AVANT_MS) {
      throw new ErreurConsultation('La consultation n’a pas encore commencé.', 409);
    }
    await this.exigerAcces(jeton, patientId);
    return patientId;
  }

  /**
   * Professionnel de santé humain. Prescrire exige la fonction ouverte pour lui (flag
   * ordonnances.electroniques) ; relire ou révoquer une ordonnance déjà émise, non : après un retour
   * arrière, le prescripteur peut toujours révoquer.
   */
  private async exigerPrescripteur(u: Utilisateur, nouvelle: boolean): Promise<OptionsOrdonnances> {
    if (!u.roles.includes('professionnel') || !u.practitionerId || u.agent) {
      throw new ErreurConsultation('Seul un professionnel de santé prescrit.', 403);
    }
    const actif =
      !nouvelle ||
      (this.ordonnances &&
        (await this.ordonnances.drapeaux.estActif('ordonnances.electroniques', {
          sujet: u.sujet,
          typeUtilisateur: 'professionnel',
        })));
    if (!this.ordonnances || !actif) {
      throw new ErreurConsultation('Fonction non disponible.', 403);
    }
    return this.ordonnances;
  }

  /**
   * Ordonnance du professionnel du rendez-vous : lignes structurées, médicaments de la nomenclature
   * du pays. Enregistrée ligne par ligne ; si une ligne échoue, celles déjà écrites sont marquées
   * « entered-in-error » (jamais une ordonnance incomplète utilisable).
   */
  async prescrire(
    u: Utilisateur,
    jeton: string,
    rendezVousId: string,
    d: { lignes: LigneSaisie[]; renouvellements?: number },
  ): Promise<ResumeOrdonnance> {
    const o = await this.exigerPrescripteur(u, true);
    if (d.lignes.length === 0 || d.lignes.length > LIGNES_MAX) {
      throw new ErreurConsultation(`Une ordonnance compte de 1 à ${LIGNES_MAX} lignes.`, 400);
    }
    if (d.lignes.some((l) => l.medicament.systeme !== o.nomenclature)) {
      throw new ErreurConsultation('Médicament hors de la nomenclature du pays.', 400);
    }
    const renouvellements = d.renouvellements ?? 0;
    if (renouvellements < 0 || renouvellements > RENOUVELLEMENTS_MAX) {
      throw new ErreurConsultation('Nombre de renouvellements invalide.', 400);
    }
    const patientId = await this.patientDuRendezVous(u, jeton, rendezVousId);
    const maintenant = this.maintenant();
    const numero = `ORD-${randomBytes(6).toString('hex').toUpperCase()}`;
    const lignes = ordonnance({
      numero,
      patientId,
      praticienId: u.practitionerId ?? '',
      lignes: d.lignes,
      prescriteLe: maintenant.toISOString(),
      valableJusquau: new Date(maintenant.getTime() + o.validiteJours * 86_400_000).toISOString(),
      renouvellements,
      env: this.env,
    });
    const violations = lignes.flatMap((l) => valider(l, this.env));
    if (violations.length > 0) {
      throw new ErreurConsultation(
        'Ordonnance incomplète.',
        400,
        [...new Set(violations.map((v) => v.regle))].join(','),
      );
    }
    const ecrites: MedicationRequest[] = [];
    try {
      for (const l of lignes) ecrites.push(await o.dossier.ajouterLigne(l));
    } catch (e) {
      for (const l of ecrites) {
        await o.dossier.changerStatut(l, 'entered-in-error').catch(() => undefined);
      }
      throw e;
    }
    return resumer(numero, ecrites);
  }

  /** Lignes d'une ordonnance de ce prescripteur ; celle d'un autre est « introuvable ». */
  private async lignesDuPrescripteur(u: Utilisateur, numero: string) {
    const o = await this.exigerPrescripteur(u, false);
    const lignes = (await o.dossier.lignes(numero)).filter((l) => l.status !== 'entered-in-error');
    if (
      lignes.length === 0 ||
      lignes.some((l) => l.requester?.reference !== `Practitioner/${u.practitionerId ?? ''}`)
    ) {
      throw new ErreurConsultation('Ordonnance introuvable.', 404);
    }
    return { o, lignes };
  }

  async lireOrdonnance(u: Utilisateur, numero: string): Promise<ResumeOrdonnance> {
    const { lignes } = await this.lignesDuPrescripteur(u, numero);
    return resumer(numero, lignes);
  }

  /** Révocation par le prescripteur, tant que l'ordonnance est active (pas encore délivrée). */
  async revoquerOrdonnance(
    u: Utilisateur,
    jeton: string,
    numero: string,
  ): Promise<ResumeOrdonnance> {
    const { o, lignes } = await this.lignesDuPrescripteur(u, numero);
    if (lignes.some((l) => l.status !== 'active')) {
      throw new ErreurConsultation('Cette ordonnance ne peut plus être révoquée.', 409);
    }
    const patientId = lignes[0]?.subject.reference?.replace(/^Patient\//, '') ?? '';
    await this.exigerAcces(jeton, patientId);
    const revoquees: MedicationRequest[] = [];
    for (const l of lignes) revoquees.push(await o.dossier.changerStatut(l, 'cancelled'));
    return resumer(numero, revoquees);
  }
}

const resumer = (numero: string, lignes: MedicationRequest[]): ResumeOrdonnance => {
  const premiere = lignes[0];
  const statuts = new Set(lignes.map((l) => l.status));
  return {
    numero,
    statut:
      statuts.size === 1 && statuts.has('active')
        ? 'active'
        : statuts.size === 1 && statuts.has('cancelled')
          ? 'revoquee'
          : 'autre',
    patientId: premiere?.subject.reference?.replace(/^Patient\//, '') ?? '',
    prescriteLe: premiere?.authoredOn ?? '',
    valableJusquau: premiere?.dispenseRequest?.validityPeriod?.end ?? '',
    lignes: lignes.map((l) => {
      const dosage = l.dosageInstruction?.[0];
      const repetition = dosage?.timing?.repeat;
      const dose = dosage?.doseAndRate?.[0]?.doseQuantity;
      return {
        medicament: l.medicationCodeableConcept?.coding?.[0]?.display ?? '',
        dose: `${dose?.value ?? ''} ${dose?.unit ?? ''}`.trim(),
        frequence: {
          fois: repetition?.frequency ?? 0,
          periode: repetition?.period ?? 0,
          unite: repetition?.periodUnit ?? '',
        },
        dureeJours: repetition?.boundsDuration?.value ?? 0,
      };
    }),
  };
};
