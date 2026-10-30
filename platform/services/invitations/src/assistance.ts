// Retrait des proches par l'équipe d'assistance (ADR-0019, décision du porteur de projet) : quand le
// patient ne peut pas le faire lui-même (téléphone perdu, proche qui abuse de son accès), un membre
// de l'équipe (rôle assistance-patient, double authentification, jamais un agent IA) :
// 1. retrouve le patient par son numéro d'assurance maladie ou provisoire ;
// 2. le rappelle au numéro enregistré dans son dossier (jamais un numéro donné par l'appelant) ;
// 3. fait confirmer sa date de naissance, que l'équipe ne voit pas : le service la compare ;
// 4. retire alors TOUS ses proches (partages, fiches, invitations) ; le patient est prévenu par SMS.
// L'équipe ne lit rien d'autre du dossier : ni prénom des proches, ni documents, ni consentements.
// Chaque étape est tracée dans le dossier du patient (AuditEvent, visible dans son historique).
//
// Récupération du compte d'un patient sans e-mail (ADR-0021) : après les mêmes vérifications, plus
// le numéro d'assurance ou provisoire lu par le patient, l'équipe reçoit un code à usage unique,
// valable 24 h, qu'elle dicte au patient (ou à son aidant, patient présent) pendant l'appel. Le
// patient le saisit dans Keycloak pour choisir un nouveau mot de passe ; il est prévenu par SMS.
import { randomUUID } from 'node:crypto';
import type { Appointment, AuditEvent, Patient, RelatedPerson } from 'fhir/r4.js';
import {
  evenementAccesDossier,
  type Environnement,
  type TypeIdentifiantPatient,
} from '@mbolo/dossier-fhir';
import type { Drapeaux } from '@mbolo/drapeaux';
import type { Utilisateur } from '@mbolo/identite';
import { genererCode, normaliser, presenter, type Empreinte } from './codes.js';
import { COHORTE_RECUPERATION, statut, type DepotInvitations } from './depot.js';
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
  /** Rendez-vous (éléments lus : statut, début, participants). */
  rendezVous(rendezVousId: string): Promise<Appointment | undefined>;
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
  /** Récupération du compte (ADR-0021) ; absente : codes de récupération refusés. */
  recuperation?: {
    empreinte: Empreinte;
    /** Durée de validité du code (décision du porteur de projet : 24 h). */
    validiteHeures: number;
    drapeaux: Pick<Drapeaux, 'estActif'>;
  };
}

/** Code de récupération, montré une seule fois au membre de l'équipe pour être dicté. */
export interface CodeRecuperation {
  code: string;
  expireLe: string;
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
   * Rendez-vous à reprendre (ADR-0026, étape 5) : le professionnel n'est plus vérifié, l'équipe
   * rappelle le patient pour lui proposer un autre médecin. Le numéro du dossier n'est donné que
   * pour un rendez-vous à venir (prévu ou en attente de paiement) ; la demande est tracée dans le
   * dossier du patient avant que rien ne soit montré.
   */
  async rappelRendezVous(
    u: Utilisateur,
    rendezVousId: string,
  ): Promise<{ patientId: string; telephone?: string }> {
    ServiceAssistance.exiger(u);
    const r = await this.dossier.rendezVous(rendezVousId);
    const patientId = r?.participant
      .map((x) => x.actor?.reference ?? '')
      .find((ref) => ref.startsWith('Patient/'))
      ?.slice('Patient/'.length);
    if (
      !r ||
      !patientId ||
      (r.status !== 'booked' && r.status !== 'pending') ||
      !r.start ||
      new Date(r.start).getTime() <= this.horloge().getTime()
    ) {
      throw new ErreurProche(404, 'Aucun rendez-vous à venir.');
    }
    ServiceAssistance.exiger(u, patientId);
    await this.tracer(u, patientId, 'rappel-rendez-vous');
    const p = await this.dossier.patient(patientId);
    const telephone = p?.telecom?.find((t) => t.system === 'phone' && t.value)?.value;
    return { patientId, ...(telephone ? { telephone } : {}) };
  }

  /**
   * Retire tous les proches du patient, après le rappel au numéro du dossier et la date de naissance
   * confirmée par le patient. Une date différente ne retire rien (tracé) ; 3 essais au plus.
   */
  /**
   * Vérifications communes après le rappel au numéro du dossier : essais limités, numéro présent,
   * date de naissance comparée par le service (jamais montrée à l'équipe ; différence tracée).
   */
  private async verifierPatient(
    u: Utilisateur,
    d: { patientId: string; naissance: string },
  ): Promise<Patient> {
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
    return p;
  }

  async retirerProches(
    u: Utilisateur,
    jetonEquipe: string,
    d: { patientId: string; naissance: string },
  ): Promise<{ retires: number; sms: 'envoyee' | 'echec' }> {
    await this.verifierPatient(u, d);
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

  /** Paramètres de récupération, si la fonction est activée pour ce membre de l'équipe. */
  private async recuperation(sujetEquipe: string) {
    const r = this.parametres.recuperation;
    const actif =
      !!r &&
      (await r.drapeaux.estActif('compte.recuperation', {
        sujet: sujetEquipe,
        typeUtilisateur: ROLE,
      }));
    if (!r || !actif) throw new ErreurProche(403, 'Fonction non activée.', 'desactive');
    return r;
  }

  /**
   * Code de récupération (ADR-0021), après le rappel au numéro du dossier, la date de naissance et le
   * numéro d'assurance ou provisoire lu par le patient, tous comparés par le service. Remplace tout
   * code encore inutilisé de ce dossier. Aucun SMS ici : le patient est au téléphone avec l'équipe.
   */
  async creerCodeRecuperation(
    u: Utilisateur,
    d: { patientId: string; naissance: string; type: TypeIdentifiantPatient; numero: string },
  ): Promise<CodeRecuperation> {
    ServiceAssistance.exiger(u, d.patientId);
    const r = await this.recuperation(u.sujet);
    const p = await this.verifierPatient(u, d);
    const systeme = this.parametres.systemes[d.type];
    if (!p.identifier?.some((i) => i.system === systeme && i.value === d.numero)) {
      await this.tracer(u, d.patientId, 'numero-different', false);
      throw new ErreurProche(409, 'Le numéro ne correspond pas.', 'numero-different');
    }
    await this.tracer(u, d.patientId, 'code-recuperation');
    const maintenant = this.horloge();
    // Une collision d'empreinte est improbable ; on retire un code le cas échéant.
    for (let essai = 0; essai < 3; essai++) {
      const code = genererCode();
      const expireLe = new Date(maintenant.getTime() + r.validiteHeures * 3_600_000);
      const cree = await this.depot.creerRecuperation(
        {
          id: randomUUID(),
          empreinte: r.empreinte(code),
          cohorte: COHORTE_RECUPERATION,
          type: 'recuperation',
          patientId: d.patientId,
          creePar: u.sujet,
          creeLe: maintenant,
          expireLe,
        },
        maintenant,
      );
      if (cree === 'cree') return { code: presenter(code), expireLe: expireLe.toISOString() };
    }
    throw new Error('Création du code de récupération impossible (collisions répétées).');
  }

  /**
   * Utilisation du code par l'extension Keycloak, pour le compte `sujet` rattaché au dossier
   * `patientId` : `false` si le code ne sert pas (inconnu, expiré, déjà utilisé, autre dossier),
   * sans jamais dire pourquoi. Un code d'un autre dossier n'est pas consommé. Le patient est prévenu
   * par SMS au numéro de son dossier.
   */
  async utiliserCodeRecuperation(d: {
    code: string;
    sujet: string;
    patientId: string;
  }): Promise<{ utilise: boolean; sms?: 'envoyee' | 'echec' }> {
    const r = this.parametres.recuperation;
    const code = normaliser(d.code);
    if (!r || !code) return { utilise: false };
    const empreinte = r.empreinte(code);
    const maintenant = this.horloge();
    const i = await this.depot.trouver(empreinte);
    if (
      !i ||
      i.type !== 'recuperation' ||
      i.patientId !== d.patientId ||
      statut(i, maintenant) !== 'valide'
    ) {
      return { utilise: false };
    }
    // La fonction doit toujours être active pour le membre de l'équipe qui a remis le code.
    const actif = await r.drapeaux.estActif('compte.recuperation', {
      sujet: i.creePar,
      typeUtilisateur: ROLE,
    });
    if (!actif || !(await this.depot.utiliser(empreinte, d.sujet, maintenant))) {
      return { utilise: false };
    }
    const sms = await this.sms
      .alerterPatient(d.patientId, 'compte-recupere')
      .catch(() => 'echec' as const);
    return { utilise: true, sms };
  }
}
