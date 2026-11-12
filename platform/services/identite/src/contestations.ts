// Contestation d'un accès par le patient (plan d'incident, écart E4 de l'exercice sur table n°1) :
// le patient voit son historique des accès ; s'il ne reconnaît pas un accès, il le signale. La
// contestation est une nouvelle trace dans le dossier (jamais une modification de l'accès), sans
// texte libre ; le responsable sécurité la reçoit et l'examine.
import { contestationAcces, type Environnement } from '@mbolo/dossier-fhir';
import type { AuditEvent } from 'fhir/r4.js';
import { ErreurAcces } from './consentements.js';
import type { JournalAcces } from './journal-acces.js';
import type { Utilisateur } from './roles.js';

export class ErreurContestation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurContestation';
  }
}

/** Sous-types des traces qu'un patient peut contester : les demandes d'accès à son dossier. */
const CONTESTABLES = new Set(['acces-dossier', 'bris-de-glace']);

const sousType = (e: AuditEvent): string => e.subtype?.[0]?.code ?? '';
const cibleDe = (e: AuditEvent): string | undefined =>
  e.entity
    ?.map((x) => x.what?.reference ?? '')
    .find((r) => r.startsWith('AuditEvent/'))
    ?.slice('AuditEvent/'.length);
const patientDe = (e: AuditEvent): string =>
  e.entity
    ?.map((x) => x.what?.reference ?? '')
    .find((r) => r.startsWith('Patient/'))
    ?.slice('Patient/'.length) ?? '';
const rolesDe = (e: AuditEvent): string[] =>
  (e.agent[0]?.role ?? []).flatMap((x) => (x.coding ?? []).map((c) => c.code ?? ''));
const urgence = (e: AuditEvent): boolean =>
  e.purposeOfEvent?.some((p) => p.coding?.some((c) => c.code === 'ETREAT')) ?? false;

export const estContestable = (e: AuditEvent): boolean => CONTESTABLES.has(sousType(e));

/** Identifiants des traces contestées parmi des traces d'un même dossier. */
export const tracesContestees = (traces: readonly AuditEvent[]): Set<string> =>
  new Set(
    traces
      .filter((e) => sousType(e) === 'contestation-acces')
      .map(cibleDe)
      .filter((x): x is string => Boolean(x)),
  );

export interface Contestation {
  contestationId: string;
  date: string;
  canal: string;
  patientId: string;
  /** L'accès contesté, tel que tracé ; absent si la trace est introuvable. */
  acces?: {
    traceId: string;
    date: string;
    /** Identifiant technique du compte qui a demandé l'accès (sujet Keycloak). */
    demandeur: string;
    roles: string[];
    autorise: boolean;
    motif?: string;
    urgence: boolean;
  };
}

export class ServiceContestations {
  constructor(
    private readonly journal: JournalAcces,
    private readonly env: Environnement,
    private readonly maintenant: () => Date = () => new Date(),
  ) {}

  /**
   * Le patient lui-même (jamais un agent IA, jamais un proche) conteste un accès à son dossier.
   * Une seconde contestation du même accès ne crée rien.
   */
  async contester(u: Utilisateur, patientId: string, traceId: string): Promise<{ cree: boolean }> {
    if (
      !u.roles.includes('patient') ||
      u.patientId !== patientId ||
      u.agent ||
      u.roles.includes('agent-ia')
    ) {
      throw new ErreurAcces('Accès refusé.');
    }
    const traces = await this.journal.parPatient(patientId);
    const cible = traces.find((e) => e.id === traceId && estContestable(e));
    if (!cible) throw new ErreurContestation('Accès introuvable dans votre historique.');
    if (tracesContestees(traces).has(traceId)) return { cree: false };
    await this.journal.consigner(
      contestationAcces({
        traceId,
        patientId,
        sujet: u.sujet,
        canal: 'patient',
        date: this.maintenant().toISOString(),
        env: this.env,
      }),
    );
    return { cree: true };
  }

  /** Contestations à examiner, les plus récentes d'abord : responsable sécurité seulement. */
  async lister(u: Utilisateur): Promise<Contestation[]> {
    if (!u.roles.includes('responsable-securite') || u.agent || u.roles.includes('agent-ia')) {
      throw new ErreurAcces('Accès refusé.');
    }
    const contestations = (await this.journal.parSousType('contestation-acces')).slice(0, 50);
    const ids = [...new Set(contestations.map(cibleDe).filter((x): x is string => Boolean(x)))];
    const acces = new Map((await this.journal.parIds(ids)).map((e) => [e.id ?? '', e]));
    return contestations.map((c): Contestation => {
      const a = acces.get(cibleDe(c) ?? '');
      return {
        contestationId: c.id ?? '',
        date: c.recorded,
        canal: c.outcomeDesc ?? '',
        patientId: patientDe(c),
        ...(a
          ? {
              acces: {
                traceId: a.id ?? '',
                date: a.recorded,
                demandeur: a.agent[0]?.who?.identifier?.value ?? '',
                roles: rolesDe(a),
                autorise: a.outcome === '0',
                ...(a.outcomeDesc ? { motif: a.outcomeDesc } : {}),
                urgence: urgence(a),
              },
            }
          : {}),
      };
    });
  }
}
