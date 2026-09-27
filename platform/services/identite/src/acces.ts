// Contrôle d'accès au dossier médical d'un patient (principe n°3 : minimisation, consentement,
// journalisation). Fonction pure : décide et explique, sans effet de bord. Refus par défaut.
import type { Consent } from 'fhir/r4.js';
import { SYSTEMES } from '@mbolo/dossier-fhir';
import type { Utilisateur } from './roles.js';

export type Motif =
  | 'patient-lui-meme'
  | 'consentement-partage-pro'
  | 'consentement-proche'
  | 'agent-session-consentie'
  | 'bris-de-glace'
  | 'refus-par-defaut'
  | 'refus-sans-consentement'
  | 'refus-role-sans-acces-clinique'
  | 'refus-agent-hors-session'
  | 'refus-bris-de-glace-sans-motif';

export interface Decision {
  autorise: boolean;
  motif: Motif;
  /** « alerte » : l'accès doit déclencher une revue humaine a posteriori (bris de glace). */
  audit: 'normal' | 'alerte';
}

export interface DemandeAcces {
  patientId: string;
  /** Accès d'urgence d'un professionnel sans consentement préalable : motif écrit obligatoire. */
  brisDeGlace?: { motif: string };
}

const refus = (motif: Motif): Decision => ({ autorise: false, motif, audit: 'normal' });
const accord = (motif: Motif, audit: Decision['audit'] = 'normal'): Decision => ({
  autorise: true,
  motif,
  audit,
});

/** Un consentement est utilisable s'il est actif, de type « permit », pour ce patient et cette catégorie. */
export function consentementActif(
  consentements: readonly Consent[],
  patientId: string,
  categorie: string,
  beneficiaire?: string,
): boolean {
  return consentements.some(
    (c) =>
      c.status === 'active' &&
      c.provision?.type === 'permit' &&
      c.patient?.reference === `Patient/${patientId}` &&
      (c.category ?? []).some((cat) =>
        (cat.coding ?? []).some((x) => x.system === SYSTEMES.consentement && x.code === categorie),
      ) &&
      (beneficiaire === undefined ||
        (c.provision.actor ?? []).some((a) => a.reference.reference === beneficiaire)),
  );
}

/**
 * Peut-on lire le dossier du patient demandé ?
 * - patient : uniquement le sien ;
 * - professionnel / infirmier : consentement C-PARTAGE-PRO actif qui le désigne, ou bris de glace motivé ;
 * - proche : consentement C-PROCHE actif qui le désigne ;
 * - agent IA : uniquement le patient de sa session, avec C-SOINS actif ;
 * - pharmacien, administrateur, relecteur des accès : jamais (revue sur les traces seulement).
 */
export function deciderAccesDossier(
  u: Utilisateur,
  demande: DemandeAcces,
  consentements: readonly Consent[],
): Decision {
  const { patientId } = demande;

  if (u.roles.includes('patient') && u.patientId === patientId) {
    return accord('patient-lui-meme');
  }

  if (u.roles.includes('agent-ia')) {
    if (!u.agent || u.agent.patientSession !== patientId) return refus('refus-agent-hors-session');
    return consentementActif(consentements, patientId, 'C-SOINS')
      ? accord('agent-session-consentie')
      : refus('refus-sans-consentement');
  }

  if ((u.roles.includes('professionnel') || u.roles.includes('infirmier')) && u.practitionerId) {
    const ref = `Practitioner/${u.practitionerId}`;
    if (consentementActif(consentements, patientId, 'C-PARTAGE-PRO', ref)) {
      return accord('consentement-partage-pro');
    }
    if (demande.brisDeGlace) {
      return demande.brisDeGlace.motif.trim().length >= 10
        ? accord('bris-de-glace', 'alerte')
        : refus('refus-bris-de-glace-sans-motif');
    }
    return refus('refus-sans-consentement');
  }

  if (u.roles.includes('proche') && u.relatedPersonId) {
    const ref = `RelatedPerson/${u.relatedPersonId}`;
    return consentementActif(consentements, patientId, 'C-PROCHE', ref)
      ? accord('consentement-proche')
      : refus('refus-sans-consentement');
  }

  if (
    u.roles.includes('pharmacien') ||
    u.roles.includes('administrateur') ||
    u.roles.includes('revue-acces')
  ) {
    return refus('refus-role-sans-acces-clinique');
  }

  return refus('refus-par-defaut');
}

/** Qui peut gérer (lire, donner, retirer) les consentements d'un patient : lui-même, ou l'agent de sa session. */
export function peutGererConsentements(u: Utilisateur, patientId: string): boolean {
  if (u.roles.includes('patient') && u.patientId === patientId) return true;
  return u.roles.includes('agent-ia') && u.agent?.patientSession === patientId;
}
