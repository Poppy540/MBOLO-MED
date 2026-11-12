// Traces d'un compte depuis une date (plan d'incident, « couper un compte compromis », écart E3 de
// l'exercice sur table n°1) : le responsable sécurité établit ce que le compte a demandé et obtenu,
// à partir du journal des accès (AuditEvent), sans jamais voir le contenu d'un dossier.
import type { AuditEvent } from 'fhir/r4.js';
import { ErreurAcces } from './consentements.js';
import type { JournalAcces } from './journal-acces.js';
import type { Utilisateur } from './roles.js';

/** Fenêtre maximale d'une recherche : au-delà, la demande est refusée (400). */
export const JOURS_MAX_TRACES = 30;

export class ErreurPeriode extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurPeriode';
  }
}

export interface TraceCompte {
  traceId: string;
  date: string;
  /** Sous-type de la trace : acces-dossier, bris-de-glace, revue-bris-de-glace… */
  type: string;
  /** Ressource visée : `Patient/…`, `Practitioner/…` ou `AuditEvent/…` (revue). */
  cible: string;
  autorise: boolean;
  /** Motif de la décision (ex. consentement-partage-pro, refus-par-defaut). */
  motif?: string;
  /** Service qui a écrit la trace. */
  source: string;
  roles: string[];
}

export interface TracesCompte {
  sujet: string;
  depuis: string;
  traces: TraceCompte[];
  /** Dossiers de patients dont l'accès a été accordé à ce compte sur la période, sans doublon. */
  dossiersAccordes: string[];
}

export class ServiceTracesCompte {
  constructor(
    private readonly journal: JournalAcces,
    private readonly maintenant: () => Date = () => new Date(),
  ) {}

  async lister(u: Utilisateur, sujet: string, depuis: string): Promise<TracesCompte> {
    if (!u.roles.includes('responsable-securite') || u.agent || u.roles.includes('agent-ia')) {
      throw new ErreurAcces('Accès refusé.');
    }
    const debut = new Date(depuis);
    const maintenant = this.maintenant().getTime();
    if (Number.isNaN(debut.getTime())) throw new ErreurPeriode('Date de début invalide.');
    if (debut.getTime() > maintenant) throw new ErreurPeriode('Date de début dans le futur.');
    if (maintenant - debut.getTime() > JOURS_MAX_TRACES * 86_400_000) {
      throw new ErreurPeriode(`Période limitée à ${JOURS_MAX_TRACES} jours.`);
    }
    const iso = debut.toISOString();
    const traces = (await this.journal.parCompte(sujet, iso)).map(versTrace);
    const dossiersAccordes = [
      ...new Set(
        traces
          .filter((t) => t.autorise && t.cible.startsWith('Patient/'))
          .map((t) => t.cible.slice('Patient/'.length)),
      ),
    ];
    return { sujet, depuis: iso, traces, dossiersAccordes };
  }
}

function versTrace(e: AuditEvent): TraceCompte {
  return {
    traceId: e.id ?? '',
    date: e.recorded,
    type: e.subtype?.[0]?.code ?? '',
    cible: e.entity?.[0]?.what?.reference ?? '',
    autorise: e.outcome === '0',
    ...(e.outcomeDesc ? { motif: e.outcomeDesc } : {}),
    source: e.source.observer.display ?? '',
    roles: (e.agent[0]?.role ?? []).flatMap((x) => (x.coding ?? []).map((c) => c.code ?? '')),
  };
}
