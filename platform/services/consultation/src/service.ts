// Consultation clinique côté professionnel.
// - Lecture du dossier : seulement après une décision d'accès favorable du service identite
//   (consentement C-PARTAGE-PRO ou bris de glace motivé), décision prise avec le jeton du demandeur.
// - Compte-rendu : rédigé par le professionnel du rendez-vous, jamais par un agent IA
//   (principe n°1, invariant mbolo-cr-1), à partir de l'ouverture de la salle, avec la même
//   décision d'accès que pour la lecture.
import type { Composition, Condition } from 'fhir/r4.js';
import {
  compteRendu,
  SECTIONS_COMPTE_RENDU,
  texteSection,
  type Environnement,
  type SectionCompteRendu,
} from '@mbolo/dossier-fhir';
import type { Utilisateur } from '@mbolo/identite';
import type { DecideurAcces } from './acces.js';
import type { Dossier } from './dossier.js';

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
}
