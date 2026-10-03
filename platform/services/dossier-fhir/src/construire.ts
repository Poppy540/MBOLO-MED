// Constructeurs de ressources conformes aux profils Mbolo Santé.
// Ils rendent impossible, par construction, les écarts les plus graves (ex. un agent IA qui
// enregistrerait un diagnostic confirmé).
import type {
  Appointment,
  AuditEvent,
  Composition,
  Condition,
  Consent,
  Patient,
  Provenance,
  Schedule,
  Slot,
} from 'fhir/r4.js';
import {
  type AuteurAnnulation,
  EXTENSION_DATE_ANNULATION,
  EXTENSION_MODE_RECUEIL,
  EXTENSION_STATUT_IDENTITE,
  type StatutIdentite,
  type TypeIdentifiantPatient,
  type ConclusionRevue,
  SECTIONS_COMPTE_RENDU,
  type SectionCompteRendu,
  MARQUEUR_FICTIF,
  PROFILS,
  SYSTEMES,
  type CategorieConsentement,
  type ModeRecueil,
} from './constantes.js';
import type { Environnement } from './regles.js';

export const meta = (profil: string, env: Environnement) => ({
  profile: [profil],
  ...(env === 'prod' ? {} : { tag: [MARQUEUR_FICTIF] }),
});

export interface OptionsConditionDeclaree {
  patientId: string;
  texte: string;
  date: string;
  /** Qui déclare : le patient lui-même (référence Patient) ou un proche (RelatedPerson). */
  declarant: string;
  env: Environnement;
}

/** Problème déclaré par le patient : toujours « unconfirmed », jamais un diagnostic. */
export function conditionDeclaree(o: OptionsConditionDeclaree): Condition {
  if (o.declarant.startsWith('Practitioner')) {
    throw new Error(
      'Une déclaration de patient ne peut pas avoir un professionnel comme déclarant.',
    );
  }
  return {
    resourceType: 'Condition',
    meta: meta(PROFILS.condition, o.env),
    clinicalStatus: { coding: [{ system: SYSTEMES.conditionClinique, code: 'active' }] },
    verificationStatus: {
      coding: [{ system: SYSTEMES.conditionVerification, code: 'unconfirmed' }],
    },
    category: [{ coding: [{ system: SYSTEMES.conditionCategorie, code: 'problem-list-item' }] }],
    code: { text: o.texte },
    subject: { reference: `Patient/${o.patientId}` },
    recordedDate: o.date,
    asserter: { reference: o.declarant },
  };
}

export interface OptionsConsentement {
  patientId: string;
  categorie: CategorieConsentement;
  mode: ModeRecueil;
  date: string;
  versionTexte: string;
  accepte: boolean;
  env: Environnement;
  /**
   * Bénéficiaire du partage (ex. « Practitioner/… », « RelatedPerson/… »).
   * Obligatoire pour C-PARTAGE-PRO et C-PROCHE (invariant mbolo-consent-1).
   */
  beneficiaire?: string;
}

export function consentement(o: OptionsConsentement): Consent {
  return {
    resourceType: 'Consent',
    meta: meta(PROFILS.consent, o.env),
    extension: [{ url: EXTENSION_MODE_RECUEIL, valueCode: o.mode }],
    status: 'active',
    scope: { coding: [{ system: SYSTEMES.consentScope, code: 'patient-privacy' }] },
    category: [{ coding: [{ system: SYSTEMES.consentement, code: o.categorie }] }],
    patient: { reference: `Patient/${o.patientId}` },
    dateTime: o.date,
    policyRule: { text: o.versionTexte },
    provision: {
      type: o.accepte ? 'permit' : 'deny',
      purpose: [{ system: SYSTEMES.actReason, code: 'TREAT' }],
      ...(o.beneficiaire
        ? {
            actor: [
              {
                role: { coding: [{ system: SYSTEMES.participationType, code: 'IRCP' }] },
                reference: { reference: o.beneficiaire },
              },
            ],
          }
        : {}),
    },
  };
}

/** Révocation : la ressource est conservée (traçabilité) et passe au statut « inactive ». */
export function revoquer(c: Consent): Consent {
  return { ...c, status: 'inactive' };
}

export interface OptionsProvenanceAgent {
  cibles: string[];
  agent: string;
  date: string;
  env: Environnement;
}

export function provenanceAgent(o: OptionsProvenanceAgent): Provenance {
  return {
    resourceType: 'Provenance',
    meta: meta(PROFILS.provenance, o.env),
    target: o.cibles.map((reference) => ({ reference })),
    recorded: o.date,
    agent: [
      {
        type: { coding: [{ system: SYSTEMES.provenanceType, code: 'author' }] },
        who: { display: o.agent },
      },
    ],
  };
}

export interface OptionsEvenementAcces {
  patientId: string;
  /** Identifiant technique du compte qui demande l'accès (sujet Keycloak), jamais un nom. */
  sujet: string;
  roles: readonly string[];
  autorise: boolean;
  /** Motif de la décision (ex. consentement-partage-pro, refus-par-defaut, bris-de-glace). */
  motifDecision: string;
  /** Accès d'urgence : justification écrite du professionnel, pour la revue humaine. */
  brisDeGlace?: { justification: string };
  /** Service qui a pris la décision (ex. identite). */
  source: string;
  /** Précisions sans donnée de santé, ex. le document d'identité consulté (ADR-0015). */
  details?: { type: string; valeur: string }[];
  date: string;
  env: Environnement;
}

/**
 * Trace d'une demande d'accès au dossier d'un patient (principe n°3 : journalisation des accès).
 * Enregistrée pour chaque décision, accordée ou refusée ; jamais modifiée ni supprimée.
 */
export function evenementAccesDossier(o: OptionsEvenementAcces): AuditEvent {
  return {
    resourceType: 'AuditEvent',
    ...(o.env === 'prod' ? {} : { meta: { tag: [MARQUEUR_FICTIF] } }),
    type: { system: SYSTEMES.auditType, code: '110110', display: 'Patient Record' },
    // Sous-type recherchable : permet de retrouver les bris de glace à revoir.
    subtype: [
      { system: SYSTEMES.sousTypeAudit, code: o.brisDeGlace ? 'bris-de-glace' : 'acces-dossier' },
    ],
    action: 'R',
    recorded: o.date,
    // 0 : succès (accès accordé) ; 4 : échec mineur (accès refusé).
    outcome: o.autorise ? '0' : '4',
    outcomeDesc: o.motifDecision,
    purposeOfEvent: [
      {
        coding: [
          {
            system: SYSTEMES.actReason,
            code: o.brisDeGlace ? 'ETREAT' : 'TREAT',
          },
        ],
      },
    ],
    agent: [
      {
        who: { identifier: { system: SYSTEMES.sujetCompte, value: o.sujet } },
        requestor: true,
        role: o.roles.map((r) => ({ coding: [{ system: SYSTEMES.role, code: r }] })),
      },
    ],
    source: { observer: { display: o.source } },
    entity: [
      {
        what: { reference: `Patient/${o.patientId}` },
        type: { system: SYSTEMES.auditEntiteType, code: '1', display: 'Person' },
        ...(o.brisDeGlace || o.details?.length
          ? {
              detail: [
                ...(o.brisDeGlace
                  ? [
                      {
                        type: 'justification-bris-de-glace',
                        valueString: o.brisDeGlace.justification,
                      },
                    ]
                  : []),
                ...(o.details ?? []).map((d) => ({ type: d.type, valueString: d.valeur })),
              ],
            }
          : {}),
      },
    ],
  };
}

export interface OptionsRevueBrisDeGlace {
  /** Identifiant de l'AuditEvent du bris de glace revu. */
  traceId: string;
  /** Identifiant technique du relecteur (sujet Keycloak). */
  sujet: string;
  conclusion: ConclusionRevue;
  commentaire?: string;
  date: string;
  env: Environnement;
}

/**
 * Revue humaine d'un bris de glace : nouvelle trace qui désigne la trace revue (les traces ne sont
 * jamais modifiées). Une revue « injustifie » ou « a-approfondir » doit être suivie par un humain.
 */
export function revueBrisDeGlace(o: OptionsRevueBrisDeGlace): AuditEvent {
  return {
    resourceType: 'AuditEvent',
    ...(o.env === 'prod' ? {} : { meta: { tag: [MARQUEUR_FICTIF] } }),
    type: { system: SYSTEMES.auditType, code: '110100', display: 'Application Activity' },
    subtype: [{ system: SYSTEMES.sousTypeAudit, code: 'revue-bris-de-glace' }],
    action: 'E',
    recorded: o.date,
    outcome: '0',
    outcomeDesc: o.conclusion,
    agent: [
      {
        who: { identifier: { system: SYSTEMES.sujetCompte, value: o.sujet } },
        requestor: true,
        role: [{ coding: [{ system: SYSTEMES.role, code: 'revue-acces' }] }],
      },
    ],
    source: { observer: { display: 'identite' } },
    entity: [
      {
        what: { reference: `AuditEvent/${o.traceId}` },
        ...(o.commentaire
          ? { detail: [{ type: 'commentaire-revue', valueString: o.commentaire }] }
          : {}),
      },
    ],
  };
}

export interface OptionsRendezVous {
  patientId: string;
  praticienId: string;
  /** Début (ISO 8601). */
  debut: string;
  dureeMinutes: number;
  /** Créneau réservé (Slot) dont découle le rendez-vous. */
  creneauId?: string;
  /** Réservation à confirmer par un paiement (ADR-0017) : statut « pending » jusqu'au paiement. */
  enAttentePaiement?: boolean;
  /** Date de la réservation (ISO 8601), point de départ du délai de paiement. */
  cree?: string;
  env: Environnement;
}

/**
 * Rendez-vous de téléconsultation vidéo (profil mbolo-rendez-vous) : un patient, un professionnel,
 * un créneau. Jamais de motif ni de commentaire (invariant mbolo-rdv-1, minimisation).
 */
export function rendezVousVideo(o: OptionsRendezVous): Appointment {
  const debut = new Date(o.debut);
  return {
    resourceType: 'Appointment',
    meta: meta(PROFILS.rendezVous, o.env),
    status: o.enAttentePaiement ? 'pending' : 'booked',
    ...(o.cree ? { created: new Date(o.cree).toISOString() } : {}),
    ...(o.creneauId ? { slot: [{ reference: `Slot/${o.creneauId}` }] } : {}),
    serviceType: [{ coding: [{ system: SYSTEMES.modeConsultation, code: 'video' }] }],
    start: debut.toISOString(),
    end: new Date(debut.getTime() + o.dureeMinutes * 60_000).toISOString(),
    minutesDuration: o.dureeMinutes,
    participant: [
      { actor: { reference: `Patient/${o.patientId}` }, status: 'accepted' },
      { actor: { reference: `Practitioner/${o.praticienId}` }, status: 'accepted' },
    ],
  };
}

/**
 * Annulation : le rendez-vous est conservé (statut « cancelled »), avec qui l'a annulé (code) et
 * quand (extension date-annulation). La salle se ferme. Jamais de motif (invariant mbolo-rdv-4).
 */
export function annulerRendezVous(
  a: Appointment,
  par: AuteurAnnulation,
  date: string,
): Appointment {
  // La plateforme n'est pas un participant : aucun participant ne décline.
  const prefixe = { patient: 'Patient/', professionnel: 'Practitioner/', plateforme: undefined }[
    par
  ];
  return {
    ...a,
    extension: [
      ...(a.extension ?? []).filter((e) => e.url !== EXTENSION_DATE_ANNULATION),
      { url: EXTENSION_DATE_ANNULATION, valueDateTime: date },
    ],
    status: 'cancelled',
    cancelationReason: { coding: [{ system: SYSTEMES.annulation, code: par }] },
    participant: a.participant.map((p) =>
      prefixe && p.actor?.reference?.startsWith(prefixe) ? { ...p, status: 'declined' } : p,
    ),
  };
}

/** Paiement confirmé (ADR-0017) : le rendez-vous en attente devient « booked », la salle s'ouvrira. */
export function confirmerRendezVous(a: Appointment): Appointment {
  return { ...a, status: 'booked' };
}

/**
 * Report vers un autre créneau du même professionnel : même rendez-vous (identifiant conservé,
 * historique des versions dans le dossier), nouvelle plage et nouvelle référence de créneau.
 */
export function reporterRendezVous(
  a: Appointment,
  c: { creneauId: string; debut: string; dureeMinutes: number },
): Appointment {
  const debut = new Date(c.debut);
  return {
    ...a,
    slot: [{ reference: `Slot/${c.creneauId}` }],
    start: debut.toISOString(),
    end: new Date(debut.getTime() + c.dureeMinutes * 60_000).toISOString(),
    minutesDuration: c.dureeMinutes,
  };
}

const video = () => [{ coding: [{ system: SYSTEMES.modeConsultation, code: 'video' }] }];

/** Agenda de téléconsultation d'un professionnel (profil mbolo-agenda). */
export function agendaVideo(o: { praticienId: string; env: Environnement }): Schedule {
  return {
    resourceType: 'Schedule',
    meta: meta(PROFILS.agenda, o.env),
    active: true,
    serviceType: video(),
    actor: [{ reference: `Practitioner/${o.praticienId}` }],
  };
}

export interface OptionsCreneau {
  agendaId: string;
  /** Début (ISO 8601). */
  debut: string;
  dureeMinutes: number;
  env: Environnement;
}

/** Créneau libre publié par un professionnel (profil mbolo-creneau), sans aucun texte libre. */
export function creneauVideo(o: OptionsCreneau): Slot {
  const debut = new Date(o.debut);
  return {
    resourceType: 'Slot',
    meta: meta(PROFILS.creneau, o.env),
    schedule: { reference: `Schedule/${o.agendaId}` },
    status: 'free',
    serviceType: video(),
    start: debut.toISOString(),
    end: new Date(debut.getTime() + o.dureeMinutes * 60_000).toISOString(),
  };
}

const echapper = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface OptionsCompteRendu {
  patientId: string;
  /** Auteur : toujours un professionnel de santé (invariant mbolo-cr-1). */
  praticienId: string;
  /** Rendez-vous de la téléconsultation. */
  rendezVousId: string;
  date: string;
  /** Texte de chaque section rédigée ; une section vide est omise. */
  sections: Partial<Record<SectionCompteRendu, string>>;
  env: Environnement;
}

/** Compte-rendu de téléconsultation (profil mbolo-compte-rendu), rédigé par le professionnel. */
export function compteRendu(o: OptionsCompteRendu): Composition {
  const sections = SECTIONS_COMPTE_RENDU.filter((s) => o.sections[s]?.trim()).map((s) => ({
    code: { coding: [{ system: SYSTEMES.sectionCompteRendu, code: s }] },
    text: {
      status: 'generated' as const,
      // nosemgrep -- texte du professionnel échappé par `echapper` avant insertion.
      div: `<div xmlns="http://www.w3.org/1999/xhtml">${echapper(o.sections[s]?.trim() ?? '')}</div>`,
    },
  }));
  if (sections.length === 0) throw new Error('Un compte-rendu contient au moins une section.');
  return {
    resourceType: 'Composition',
    meta: meta(PROFILS.compteRendu, o.env),
    status: 'final',
    type: {
      coding: [{ system: SYSTEMES.typeDocument, code: 'compte-rendu-teleconsultation' }],
    },
    subject: { reference: `Patient/${o.patientId}` },
    date: o.date,
    author: [{ reference: `Practitioner/${o.praticienId}` }],
    title: 'Compte-rendu de téléconsultation',
    event: [{ detail: [{ reference: `Appointment/${o.rendezVousId}` }] }],
    section: sections,
  };
}

/** Texte brut d'une section (le narratif FHIR est du XHTML échappé par compteRendu). */
export function texteSection(c: Composition, s: SectionCompteRendu): string | undefined {
  const div = c.section?.find((x) => x.code?.coding?.some((k) => k.code === s))?.text?.div;
  if (!div) return undefined;
  return div
    .replace(/^<div[^>]*>/, '')
    .replace(/<\/div>$/, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

export interface OptionsPatientInscrit {
  nom: string;
  prenom: string;
  /** Date de naissance AAAA-MM-JJ. */
  naissance: string;
  sexe?: 'female' | 'male' | 'other' | 'unknown';
  /** Téléphone mobile, au format international du pays. */
  telephone?: string;
  /** Numéro d'assurance maladie ou provisoire ; le système (URI) vient de la configuration du pays. */
  identifiant?: { type: TypeIdentifiantPatient; systeme: string; valeur: string };
  env: Environnement;
}

/**
 * Patient qui vient de s'inscrire avec un code d'invitation (ADR-0014) : identité déclarée,
 * statut « a-verifier ». Rien d'autre que le minimum nécessaire aux soins.
 */
export function patientInscrit(o: OptionsPatientInscrit): Patient {
  return {
    resourceType: 'Patient',
    meta: meta(PROFILS.patient, o.env),
    extension: [{ url: EXTENSION_STATUT_IDENTITE, valueCode: 'a-verifier' }],
    ...(o.identifiant
      ? {
          identifier: [
            {
              system: o.identifiant.systeme,
              type: {
                coding: [{ system: SYSTEMES.typeIdentifiantPatient, code: o.identifiant.type }],
              },
              value: o.identifiant.valeur,
            },
          ],
        }
      : {}),
    name: [{ family: o.nom, given: [o.prenom] }],
    ...(o.sexe ? { gender: o.sexe } : {}),
    birthDate: o.naissance,
    ...(o.telephone ? { telecom: [{ system: 'phone', value: o.telephone, use: 'mobile' }] } : {}),
  };
}

export function statutIdentite(p: Patient): StatutIdentite | undefined {
  const code = p.extension?.find((e) => e.url === EXTENSION_STATUT_IDENTITE)?.valueCode;
  return code === 'a-verifier' || code === 'verifiee' || code === 'refusee' ? code : undefined;
}

/** Nouveau statut, décidé par un humain habilité (la trace du contrôle va dans le journal). */
export function changerStatutIdentite(p: Patient, statut: StatutIdentite): Patient {
  return {
    ...p,
    extension: [
      ...(p.extension ?? []).filter((e) => e.url !== EXTENSION_STATUT_IDENTITE),
      { url: EXTENSION_STATUT_IDENTITE, valueCode: statut },
    ],
  };
}
