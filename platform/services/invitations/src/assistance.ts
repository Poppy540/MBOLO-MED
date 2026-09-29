// Retrait des proches par l'équipe d'assistance (ADR-0019, décision du porteur de projet) : quand le
// patient ne peut pas le faire lui-même (téléphone perdu, proche qui abuse de son accès), un membre
// de l'équipe (rôle assistance-patient, double authentification, jamais un agent IA) :
// 1. retrouve le patient par son numéro d'assurance maladie ou provisoire ;
// 2. le rappelle au numéro enregistré dans son dossier (jamais un numéro donné par l'appelant) ;
// 3. fait confirmer sa date de naissance, que l'équipe ne voit pas : le service la compare ;
// 4. retire alors TOUS ses proches (partages, fiches, invitations) ; le patient est prévenu par SMS.
// L'équipe ne lit rien d'autre du dossier : ni prénom des proches, ni documents, ni consentements.
// Chaque étape est tracée dans le dossier du patient (AuditEvent, visible dans son historique).
import type { AuditEvent, Patient, RelatedPerson } from 'fhir/r4.js';
import {
  evenementAccesDossier,
  type Environnement,
  type TypeIdentifiantPatient,
} from '@mbolo/dossier-fhir';
import type { Utilisateur } from '@mbolo/identite';
import type { DepotInvitations } from './depot.js';
import type { Limiteur } from './limiteur.js';
import { ErreurProche, type DossierProches, type SmsInvitation } from './proches.js';

const ROLE = 'assistance-patient';
const SOURCE = 'invitations';

/** Accès au dossier pour l'assistance, par la passerelle (compte de service des invitations). */
export interface DossierAssistance {
  /** Patients portant ce numéro (éléments lus : numéro, téléphone, date de naissance). */
  rechercherPatients(systeme: string, valeur: string): Promise<Patient[]>;
  patient(patientId: string): Promise<Patient | undefined>;
  /** Fiches des proches de ce patient (RelatedPerson.patient). */
  prochesDuPatient(patientId: string): Promise<RelatedPerson[]>;
  tracer(trace: AuditEvent): Promise<void>;
}

/** Partages C-PROCHE, révoqués par identite avec le jeton du membre de l'équipe. */
export interface ConsentementsAssistance {
  retirerTous(o: { jetonEquipe: string; patientId: string }): Promise<number>;
}

export interface ParametresAssistance {
  /** Système (URI) de chaque type de numéro : il dépend du pays (Gabon : CNAMGS). */
  systemes: Record<TypeIdentifiantPatient, string>;
  env: Environnement;
}

export interface FicheAssistance {
  patientId: string;
  /** Numéro du dossier, pour rappeler le patient ; absent : pas de rappel possible, pas de retrait. */
  telephone?: string;
  /** Proches avec un compte actif ou une invitation en cours. */
  proches: number;
}

export class ServiceAssistance {
  constructor(
    private readonly depot: DepotInvitations,
    private readonly dossier: DossierAssistance,
    private readonly fiches: Pick<DossierProches, 'desactiver'>,
    private readonly consentements: ConsentementsAssistance,
    private readonly sms: Pick<SmsInvitation, 'alerterPatient'>,
    /** Essais de date de naissance par membre de l'équipe et par patient (ex. 3 par 15 minutes). */
    private readonly essais: Limiteur,
    private readonly parametres: ParametresAssistance,
    private readonly horloge: () => Date = () => new Date(),
  ) {}

  private static exiger(u: Utilisateur, patientId?: string): void {
    if (!u.roles.includes(ROLE) || u.roles.includes('agent-ia') || u.agent) {
      throw new ErreurProche(403, 'Accès refusé.');
    }
    // Personne ne traite sa propre demande.
    if (patientId && u.patientId === patientId) throw new ErreurProche(403, 'Accès refusé.');
  }

  /** Trace dans le dossier, avant de montrer ou de faire quoi que ce soit (échec : rien n'est fait). */
  private tracer(u: Utilisateur, patientId: string, etape: string, autorise = true) {
    return this.dossier.tracer(
      evenementAccesDossier({
        patientId,
        sujet: u.sujet,
        roles: u.roles,
        autorise,
        motifDecision: ROLE,
        source: SOURCE,
        details: [{ type: 'assistance-proches', valeur: etape }],
        date: this.horloge().toISOString(),
        env: this.parametres.env,
      }),
    );
  }

  /** Fiches rattachées à une invitation encore valable ou utilisée (proche à retirer). */
  private async aRetirer(patientId: string): Promise<RelatedPerson[]> {
    const maintenant = this.horloge();
    const resultat: RelatedPerson[] = [];
    for (const f of await this.dossier.prochesDuPatient(patientId)) {
      if (!f.id) continue;
      const i = await this.depot.parFiche(f.id);
      const enCours = !!i && !i.revoqueLe && (!!i.utiliseLe || i.expireLe > maintenant);
      if (f.active || enCours) resultat.push(f);
    }
    return resultat;
  }

  async rechercher(
    u: Utilisateur,
    d: { type: TypeIdentifiantPatient; numero: string },
  ): Promise<FicheAssistance> {
    ServiceAssistance.exiger(u);
    const trouves = await this.dossier.rechercherPatients(
      this.parametres.systemes[d.type],
      d.numero,
    );
    // Un numéro doit désigner un seul dossier ; sinon rien n'est montré.
    const p = trouves.length === 1 ? trouves[0] : undefined;
    if (!p?.id) throw new ErreurProche(404, 'Aucun dossier unique pour ce numéro.');
    ServiceAssistance.exiger(u, p.id);
    await this.tracer(u, p.id, 'recherche');
    const telephone = p.telecom?.find((t) => t.system === 'phone' && t.value)?.value;
    return {
      patientId: p.id,
      ...(telephone ? { telephone } : {}),
      proches: (await this.aRetirer(p.id)).length,
    };
  }

  /**
   * Retire tous les proches du patient, après le rappel au numéro du dossier et la date de naissance
   * confirmée par le patient. Une date différente ne retire rien (tracé) ; 3 essais au plus.
   */
  async retirerProches(
    u: Utilisateur,
    jetonEquipe: string,
    d: { patientId: string; naissance: string },
  ): Promise<{ retires: number; sms: 'envoyee' | 'echec' }> {
    ServiceAssistance.exiger(u, d.patientId);
    if (!(await this.essais.essayer(`${u.sujet}:${d.patientId}`, this.horloge().getTime()))) {
      throw new ErreurProche(429, 'Trop d’essais. Réessayez plus tard.', 'trop-d-essais');
    }
    const p = await this.dossier.patient(d.patientId);
    if (!p) throw new ErreurProche(404, 'Dossier introuvable.');
    if (!p.telecom?.some((t) => t.system === 'phone' && t.value)) {
      throw new ErreurProche(
        409,
        'Aucun numéro dans le dossier : rappel impossible.',
        'sans-numero',
      );
    }
    if (!p.birthDate || p.birthDate !== d.naissance) {
      await this.tracer(u, d.patientId, 'naissance-differente', false);
      throw new ErreurProche(
        409,
        'La date de naissance ne correspond pas.',
        'naissance-differente',
      );
    }
    await this.tracer(u, d.patientId, 'retrait-proches');
    const fiches = await this.aRetirer(d.patientId);
    // D'abord l'accès (partages), puis les fiches et les codes : un échec laisse l'accès déjà coupé.
    await this.consentements.retirerTous({ jetonEquipe, patientId: d.patientId });
    const maintenant = this.horloge();
    for (const f of fiches) {
      if (!f.id) continue;
      if (f.active) await this.fiches.desactiver(f.id);
      await this.depot.revoquerParFiche(f.id, maintenant);
    }
    const sms = await this.sms
      .alerterPatient(d.patientId, 'proches-retires')
      .catch(() => 'echec' as const);
    return { retires: fiches.length, sms };
  }
}
